import { env } from "./server-env";

/**
 * True when `ENVIRONMENT` names a deployed environment rather than a local
 * checkout. Managed environments are migrated ahead of traffic, must not accept
 * unauthenticated developer identities, and must not issue unsigned sessions.
 */
export function isManagedEnvironment() {
  const name = env.ENVIRONMENT?.trim().toLowerCase() ?? "";
  return name !== "" && name !== "development" && name !== "local" && name !== "test";
}
