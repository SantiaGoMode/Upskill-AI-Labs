import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohortEnrollments, cohorts, localSessions, localUsers, organizationMembers } from "../../../db/schema";
import {
  configuredDeveloperEmail,
  developerSignInAvailable,
  getLocalSessionToken,
  getRequestIdentity,
  LOCAL_SESSION_COOKIE,
  sessionSecret,
  sessionSigningUnavailable,
  unauthorizedResponse,
} from "../../lib/request-identity";
import { readJsonBody } from "../../lib/request-limits";
import { isManagedEnvironment } from "../../lib/runtime-env";
import { chunkIds } from "../../lib/sql-chunks";
import { createSessionToken, readSessionToken } from "../../lib/session-token";

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

const sessionCookie = (token: string, request: Request, maxAge: number) => {
  // A deployed environment is always served over TLS, even when an internal hop
  // to the worker is plain HTTP, so the flag is not inferred from the URL alone.
  const secure = new URL(request.url).protocol === "https:" || isManagedEnvironment() ? "; Secure" : "";
  return `${LOCAL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  return Response.json({
    identity,
    // Invitations are redeemable anywhere; the passwordless developer account is not.
    sessionsAvailable: !sessionSigningUnavailable(),
    developerSignInAvailable: developerSignInAvailable(request),
  });
}

export async function POST(request: Request) {
  await ensureLabSchema();
  const parsed = await readJsonBody<{ action?: "sign-in" | "sign-out"; email?: string; displayName?: string; inviteToken?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const db = getDb();

  if (body.action === "sign-out") {
    const sessionId = await readSessionToken(getLocalSessionToken(request), sessionSecret());
    if (sessionId) await db.delete(localSessions).where(eq(localSessions.id, sessionId));
    return Response.json({ signedOut: true }, { headers: { "set-cookie": sessionCookie("", request, 0) } });
  }
  if (body.action !== "sign-in") return Response.json({ error: "Unsupported action" }, { status: 400 });
  if (sessionSigningUnavailable()) {
    return Response.json({ error: "Accounts are unavailable until SESSION_SECRET is configured" }, { status: 503 });
  }

  let email = body.email?.trim().toLowerCase() ?? "";
  let displayName = body.displayName?.trim() || email;
  let role: "learner" | "facilitator" = "learner";

  if (body.inviteToken?.trim()) {
    const [member] = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.inviteToken, body.inviteToken.trim()), eq(organizationMembers.status, "invited"))).limit(1);
    if (!member) return Response.json({ error: "Invitation is invalid or has already been used" }, { status: 404 });
    email = member.email; displayName = member.displayName; role = member.role === "facilitator" ? "facilitator" : "learner";
    const now = new Date().toISOString();
    await db.update(organizationMembers).set({ status: "active", inviteToken: null, joinedAt: now }).where(eq(organizationMembers.id, member.id));
    const organizationCohorts = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.organizationId, member.organizationId));
    // Chunked: an established organization can hold more cohorts than D1 allows
    // bound parameters in a single statement.
    for (const batch of chunkIds(organizationCohorts.map((cohort) => cohort.id))) {
      await db.update(cohortEnrollments).set({ status: "enrolled", joinedAt: now, updatedAt: now })
        .where(and(eq(cohortEnrollments.learnerEmail, email), inArray(cohortEnrollments.cohortId, batch)));
    }
  } else {
    // Signing in without a credential is a local development affordance only.
    if (!developerSignInAvailable(request)) {
      return Response.json({ error: "Sign in with a cohort invitation" }, { status: 403 });
    }
    const configuredEmail = configuredDeveloperEmail();
    const [existing] = await db.select().from(localUsers).where(eq(localUsers.email, email)).limit(1);
    if (!email || email !== configuredEmail && !existing) return Response.json({ error: "Use the configured local account or a valid invitation" }, { status: 403 });
    role = existing?.role === "facilitator" || email === configuredEmail && env.LOCAL_DEV_ROLE !== "learner" ? "facilitator" : "learner";
    displayName = body.displayName?.trim() || existing?.displayName || (email === configuredEmail ? "Local facilitator" : email);
  }

  await db.insert(localUsers).values({ email, displayName, role }).onConflictDoUpdate({ target: localUsers.email, set: { displayName, role, status: "active", updatedAt: new Date().toISOString() } });
  const sessionId = crypto.randomUUID();
  await db.insert(localSessions).values({ id: sessionId, userEmail: email, expiresAt: new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString() });
  const token = await createSessionToken(sessionId, sessionSecret());
  return Response.json(
    { identity: { email, displayName, role, source: "local-session" } },
    { status: 201, headers: { "set-cookie": sessionCookie(token, request, SESSION_MAX_AGE) } },
  );
}
