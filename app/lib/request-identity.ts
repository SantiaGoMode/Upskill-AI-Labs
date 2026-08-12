import { env } from "./server-env";
import { eq } from "../../db/firestore-orm";
import { getDb } from "../../db";
import { localSessions, localUsers } from "../../db/schema";
import { readHeaderIdentity, type RequestIdentity } from "./identity-trust";
import { isManagedEnvironment } from "./runtime-env";
import { readSessionToken } from "./session-token";

export type { RequestIdentity } from "./identity-trust";
export { PROXY_SECRET_HEADER } from "./identity-trust";

export const LOCAL_SESSION_COOKIE = "upskill_session";

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export const getLocalSessionToken = (request: Request) => cookieValue(request, LOCAL_SESSION_COOKIE);

export const sessionSecret = () => env.SESSION_SECRET?.trim() ?? "";

/**
 * True when a passwordless sign-in as the configured developer account is
 * allowed. A deployed environment must use the proxy or an invitation instead.
 */
export function developerSignInAvailable(request: Request) {
  return isLocalRequest(request) && !isManagedEnvironment();
}

/** True when signing a session requires a secret that has not been configured. */
export function sessionSigningUnavailable() {
  return isManagedEnvironment() && !sessionSecret();
}

export function configuredDeveloperEmail() {
  return env.LOCAL_DEV_USER_EMAIL?.trim().toLowerCase() || "local-developer@upskill.invalid";
}

async function sessionIdentity(request: Request): Promise<RequestIdentity | null> {
  const cookie = getLocalSessionToken(request);
  if (!cookie) return null;
  // A deployment with no signing secret cannot verify any cookie it is handed.
  if (sessionSigningUnavailable()) return null;

  const sessionId = await readSessionToken(cookie, sessionSecret());
  if (!sessionId) return null;

  const [session] = await getDb().select({
    email: localUsers.email,
    displayName: localUsers.displayName,
    role: localUsers.role,
    status: localUsers.status,
    expiresAt: localSessions.expiresAt,
  }).from(localSessions).innerJoin(localUsers, eq(localUsers.email, localSessions.userEmail))
    .where(eq(localSessions.id, sessionId)).limit(1);

  if (session?.status !== "active") return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;

  return {
    email: session.email,
    displayName: session.displayName,
    source: "local-session",
    role: session.role === "facilitator" ? "facilitator" : "learner",
  };
}

export async function getRequestIdentity(request: Request): Promise<RequestIdentity | null> {
  const local = isLocalRequest(request);
  const managed = isManagedEnvironment();

  const headerIdentity = readHeaderIdentity(request.headers, {
    proxySecret: env.TRUSTED_PROXY_SECRET?.trim() ?? "",
    managed,
    local,
  });
  if (headerIdentity) return headerIdentity;

  // Account sessions work on any hostname so an invited learner can sign in.
  const session = await sessionIdentity(request);
  if (session) return session;

  // Passwordless developer fallback, for local checkouts only.
  if (local && !managed) {
    return {
      email: configuredDeveloperEmail(),
      displayName: "Local learner",
      source: "local",
      role: env.LOCAL_DEV_ROLE === "learner" ? "learner" : "facilitator",
    };
  }

  return null;
}

export function unauthorizedResponse() {
  return Response.json({ error: "Authentication is required" }, { status: 401 });
}

export function facilitatorRequiredResponse() {
  return Response.json({ error: "Facilitator access is required" }, { status: 403 });
}
