/**
 * Decides whether upstream identity headers may be believed.
 *
 * `oai-authenticated-user-*` headers are ordinary request headers: any client
 * can send them. They describe an authenticated user only if the request
 * demonstrably came from the authenticating proxy, which it does by presenting
 * the shared secret below. This module is deliberately free of runtime bindings
 * so the trust decision can be unit tested directly.
 */

export type IdentityRole = "viewer" | "learner" | "facilitator" | "admin";

export type RequestIdentity = {
  email: string;
  displayName: string;
  source: "trusted-header" | "local-session" | "local" | "public-demo";
  role: IdentityRole;
};

/** Header the authenticating reverse proxy uses to prove its origin. */
export const PROXY_SECRET_HEADER = "x-upskill-proxy-secret";

/**
 * Compares two secrets without an early exit on the first differing byte.
 * Unequal lengths are rejected immediately, which reveals only the length of a
 * value the caller already supplied.
 */
export function secretsMatch(presented: string, expected: string) {
  if (presented.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < presented.length; index += 1) {
    difference |= presented.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export type HeaderTrustContext = {
  /** Configured shared secret. Empty when none is configured. */
  proxySecret: string;
  /** True when this is a deployed environment rather than a local checkout. */
  managed: boolean;
  /** True when the request arrived on a loopback hostname. */
  local: boolean;
};

export function headerIdentityIsTrusted(presentedSecret: string, context: HeaderTrustContext) {
  if (context.proxySecret) return secretsMatch(presentedSecret, context.proxySecret);
  // With no secret configured a deployment has no way to distinguish its proxy
  // from the public internet, so it must not infer identity from headers at all.
  // A local checkout keeps accepting them, which is how the test suite and
  // manual role switching simulate different users.
  return !context.managed && context.local;
}

export function readHeaderIdentity(headers: Headers, context: HeaderTrustContext): RequestIdentity | null {
  if (!headerIdentityIsTrusted(headers.get(PROXY_SECRET_HEADER) ?? "", context)) return null;

  const email = headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return null;

  const encodedName = headers.get("oai-authenticated-user-full-name");
  const encoding = headers.get("oai-authenticated-user-full-name-encoding");
  let displayName = email;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      displayName = decodeURIComponent(encodedName);
    } catch {
      displayName = email;
    }
  }

  const requestedRole = headers.get("oai-authenticated-user-role");
  const role: IdentityRole = requestedRole === "admin"
    ? "admin"
    : requestedRole === "facilitator"
      ? "facilitator"
      : requestedRole === "viewer"
        ? "viewer"
        : "learner";

  return {
    email,
    displayName,
    source: "trusted-header",
    role,
  };
}

export const hasFacilitatorAccess = (identity: Pick<RequestIdentity, "role">) =>
  identity.role === "facilitator" || identity.role === "admin";

export const hasAdminAccess = (identity: Pick<RequestIdentity, "role">) => identity.role === "admin";
