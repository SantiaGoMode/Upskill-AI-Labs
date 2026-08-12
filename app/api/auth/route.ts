import { env } from "../../lib/server-env";
import { getAuth } from "firebase-admin/auth";
import { getAdminApp } from "../../../db/firebase-admin";
import { and, eq, inArray } from "../../../db/firestore-orm";
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
} from "../../lib/request-identity";
import { readJsonBody } from "../../lib/request-limits";
import { isManagedEnvironment } from "../../lib/runtime-env";
import { chunkIds } from "../../lib/sql-chunks";
import { createSessionToken, readSessionToken } from "../../lib/session-token";
import type { IdentityRole } from "../../lib/identity-trust";

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
  return Response.json({
    identity,
    // Invitations are redeemable anywhere; the passwordless developer account is not.
    sessionsAvailable: !sessionSigningUnavailable(),
    developerSignInAvailable: developerSignInAvailable(request),
    firebaseSignInAvailable: isManagedEnvironment(),
  });
}

export async function POST(request: Request) {
  await ensureLabSchema();
  const parsed = await readJsonBody<{ action?: "sign-in" | "sign-out" | "firebase-sign-in"; email?: string; displayName?: string; inviteToken?: string; idToken?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const db = getDb();

  if (body.action === "sign-out") {
    const sessionId = await readSessionToken(getLocalSessionToken(request), sessionSecret());
    if (sessionId) await db.delete(localSessions).where(eq(localSessions.id, sessionId));
    return Response.json({ signedOut: true }, { headers: { "set-cookie": sessionCookie("", request, 0) } });
  }
  if (body.action !== "sign-in" && body.action !== "firebase-sign-in") return Response.json({ error: "Unsupported action" }, { status: 400 });
  if (sessionSigningUnavailable()) {
    return Response.json({ error: "Accounts are unavailable until SESSION_SECRET is configured" }, { status: 503 });
  }

  let email = body.email?.trim().toLowerCase() ?? "";
  let displayName = body.displayName?.trim() || email;
  let role: Exclude<IdentityRole, "viewer"> = "learner";

  if (body.action === "firebase-sign-in") {
    if (!isManagedEnvironment()) return Response.json({ error: "Google sign-in is only enabled for the deployed app" }, { status: 403 });
    if (!body.idToken) return Response.json({ error: "Google sign-in token is required" }, { status: 400 });
    let token: Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;
    try {
      token = await getAuth(getAdminApp()).verifyIdToken(body.idToken);
    } catch {
      return Response.json({ error: "Google sign-in could not be verified" }, { status: 401 });
    }
    email = token.email?.trim().toLowerCase() ?? "";
    if (!email || token.email_verified !== true) {
      return Response.json({ error: "A verified Google email is required" }, { status: 403 });
    }
    displayName = typeof token.name === "string" && token.name.trim() ? token.name.trim() : email;
    const admins = new Set((env.ADMIN_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
    const facilitators = new Set((env.FACILITATOR_EMAILS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
    const [existingUser] = await db.select().from(localUsers).where(eq(localUsers.email, email)).limit(1);
    const [member] = await db.select().from(organizationMembers).where(eq(organizationMembers.email, email)).limit(1);
    if (existingUser?.status === "disabled" && !admins.has(email)) {
      return Response.json({ error: "This account has been disabled" }, { status: 403 });
    }
    if (!admins.has(email) && !facilitators.has(email) && existingUser?.status !== "active" && member?.status !== "active") {
      return Response.json({ error: "This Google account has not been invited" }, { status: 403 });
    }
    role = admins.has(email)
      ? "admin"
      : facilitators.has(email) || existingUser?.role === "facilitator" || member?.role === "facilitator"
        ? "facilitator"
        : "learner";
    displayName = existingUser?.displayName || displayName;
  } else if (body.inviteToken?.trim()) {
    const [member] = await db.select().from(organizationMembers)
      .where(and(eq(organizationMembers.inviteToken, body.inviteToken.trim()), eq(organizationMembers.status, "invited"))).limit(1);
    if (!member) return Response.json({ error: "Invitation is invalid or has already been used" }, { status: 404 });
    const [existingUser] = await db.select().from(localUsers).where(eq(localUsers.email, member.email)).limit(1);
    if (existingUser?.status === "disabled") return Response.json({ error: "This account has been disabled" }, { status: 403 });
    email = member.email; displayName = member.displayName; role = member.role === "facilitator" ? "facilitator" : "learner";
    const now = new Date().toISOString();
    await db.update(organizationMembers).set({ status: "active", inviteToken: null, joinedAt: now }).where(eq(organizationMembers.id, member.id));
    const organizationCohorts = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.organizationId, member.organizationId));
    // Chunked to stay inside Firestore's `in` query value limit.
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
    if (existing?.status === "disabled") return Response.json({ error: "This account has been disabled" }, { status: 403 });
    if (!email || email !== configuredEmail && !existing) return Response.json({ error: "Use the configured local account or a valid invitation" }, { status: 403 });
    role = existing?.role === "admin"
      ? "admin"
      : existing?.role === "facilitator" || email === configuredEmail && env.LOCAL_DEV_ROLE !== "learner"
        ? "facilitator"
        : "learner";
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
