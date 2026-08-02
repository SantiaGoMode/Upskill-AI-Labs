import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureLabSchema } from "../../../db/runtime";
import { cohortEnrollments, cohorts, localSessions, localUsers, organizationMembers } from "../../../db/schema";
import { getLocalSessionToken, getRequestIdentity, isLocalRequest, LOCAL_SESSION_COOKIE, unauthorizedResponse } from "../../lib/request-identity";

const sessionCookie = (token: string, request: Request, maxAge: number) => {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${LOCAL_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};

export async function GET(request: Request) {
  await ensureLabSchema();
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();
  return Response.json({ identity, localSessionsAvailable: isLocalRequest(request) });
}

export async function POST(request: Request) {
  await ensureLabSchema();
  if (!isLocalRequest(request)) return Response.json({ error: "Local account switching is available only on localhost" }, { status: 403 });
  const body = await request.json() as { action?: "sign-in" | "sign-out"; email?: string; displayName?: string; inviteToken?: string };
  const db = getDb();
  if (body.action === "sign-out") {
    const token = getLocalSessionToken(request);
    if (token) await db.delete(localSessions).where(eq(localSessions.id, token));
    return Response.json({ signedOut: true }, { headers: { "set-cookie": sessionCookie("", request, 0) } });
  }
  if (body.action !== "sign-in") return Response.json({ error: "Unsupported action" }, { status: 400 });

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
    if (organizationCohorts.length) await db.update(cohortEnrollments).set({ status: "enrolled", joinedAt: now, updatedAt: now }).where(and(eq(cohortEnrollments.learnerEmail, email), inArray(cohortEnrollments.cohortId, organizationCohorts.map((cohort) => cohort.id))));
  } else {
    const bindings = env as unknown as Record<string, unknown>;
    const configuredEmail = typeof bindings.LOCAL_DEV_USER_EMAIL === "string" ? bindings.LOCAL_DEV_USER_EMAIL.trim().toLowerCase() : "local-developer@upskill.invalid";
    const [existing] = await db.select().from(localUsers).where(eq(localUsers.email, email)).limit(1);
    if (!email || email !== configuredEmail && !existing) return Response.json({ error: "Use the configured local account or a valid invitation" }, { status: 403 });
    role = existing?.role === "facilitator" || email === configuredEmail && bindings.LOCAL_DEV_ROLE !== "learner" ? "facilitator" : "learner";
    displayName = body.displayName?.trim() || existing?.displayName || (email === configuredEmail ? "Local facilitator" : email);
  }

  await db.insert(localUsers).values({ email, displayName, role }).onConflictDoUpdate({ target: localUsers.email, set: { displayName, role, status: "active", updatedAt: new Date().toISOString() } });
  const token = crypto.randomUUID(); const maxAge = 7 * 24 * 60 * 60;
  await db.insert(localSessions).values({ id: token, userEmail: email, expiresAt: new Date(Date.now() + maxAge * 1000).toISOString() });
  return Response.json({ identity: { email, displayName, role, source: "local-session" } }, { status: 201, headers: { "set-cookie": sessionCookie(token, request, maxAge) } });
}
