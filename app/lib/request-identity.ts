import { env } from "cloudflare:workers";

export type RequestIdentity = {
  email: string;
  displayName: string;
  source: "trusted-header" | "local";
};

export function getRequestIdentity(request: Request): RequestIdentity | null {
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
    return { email, displayName, source: "trusted-header" };
  }

  const hostname = new URL(request.url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    const bindings = env as unknown as Record<string, unknown>;
    const configured = typeof bindings.LOCAL_DEV_USER_EMAIL === "string"
      ? bindings.LOCAL_DEV_USER_EMAIL.trim().toLowerCase()
      : "";
    return {
      email: configured || "local-developer@upskill.invalid",
      displayName: "Local learner",
      source: "local",
    };
  }

  return null;
}

export function unauthorizedResponse() {
  return Response.json({ error: "Authentication is required" }, { status: 401 });
}
