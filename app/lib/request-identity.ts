import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { localSessions, localUsers } from "../../db/schema";

export type RequestIdentity = {
  email: string;
  displayName: string;
  source: "trusted-header" | "local-session" | "local";
  role: "learner" | "facilitator";
};

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

export async function getRequestIdentity(request: Request): Promise<RequestIdentity | null> {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (email) {
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
    let displayName = email;
    if (encodedName && encoding === "percent-encoded-utf-8") {
      try {
        displayName = decodeURIComponent(encodedName);
      } catch {
        displayName = email;
      }
    }
    const role = request.headers.get("oai-authenticated-user-role") === "facilitator"
      ? "facilitator"
      : "learner";
    return { email, displayName, source: "trusted-header", role };
  }

  if (isLocalRequest(request)) {
    const token = cookieValue(request, LOCAL_SESSION_COOKIE);
    if (token) {
      const [session] = await getDb().select({
        email: localUsers.email,
        displayName: localUsers.displayName,
        role: localUsers.role,
        status: localUsers.status,
        expiresAt: localSessions.expiresAt,
      }).from(localSessions).innerJoin(localUsers, eq(localUsers.email, localSessions.userEmail))
        .where(eq(localSessions.id, token)).limit(1);
      if (session?.status === "active" && new Date(session.expiresAt).getTime() > Date.now()) {
        return {
          email: session.email,
          displayName: session.displayName,
          source: "local-session",
          role: session.role === "facilitator" ? "facilitator" : "learner",
        };
      }
    }
    const bindings = env as unknown as Record<string, unknown>;
    const configured = typeof bindings.LOCAL_DEV_USER_EMAIL === "string"
      ? bindings.LOCAL_DEV_USER_EMAIL.trim().toLowerCase()
      : "";
    return {
      email: configured || "local-developer@upskill.invalid",
      displayName: "Local learner",
      source: "local",
      role: bindings.LOCAL_DEV_ROLE === "learner" ? "learner" : "facilitator",
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
