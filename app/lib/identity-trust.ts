/** Local request-header identities used by API and browser tests. */

export type IdentityRole = "viewer" | "learner" | "facilitator" | "admin";

export type RequestIdentity = {
  email: string;
  displayName: string;
  source: "local-header" | "local-session" | "local" | "public-demo";
  role: IdentityRole;
};

export function readLocalHeaderIdentity(headers: Headers, allowed: boolean): RequestIdentity | null {
  if (!allowed) return null;

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
    source: "local-header",
    role,
  };
}

export const hasFacilitatorAccess = (identity: Pick<RequestIdentity, "role">) =>
  identity.role === "facilitator" || identity.role === "admin";

export const hasAdminAccess = (identity: Pick<RequestIdentity, "role">) => identity.role === "admin";
