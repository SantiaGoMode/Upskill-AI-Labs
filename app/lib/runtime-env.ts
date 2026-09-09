import { env } from "./server-env";

/**
 * True when `ENVIRONMENT` names a deployed environment rather than a local
 * checkout. Managed environments are migrated ahead of traffic, must not accept
 * unauthenticated developer identities, and must not issue unsigned sessions.
 */
export function isManagedEnvironment() {
  const name = env.ENVIRONMENT?.trim().toLowerCase() ?? "";
  return Boolean(env.K_SERVICE?.trim()) || (name !== "" && name !== "development" && name !== "local" && name !== "test");
}

/** Emulators exercise Firestore without enabling deployed identity rules. */
export function usesFirestore() {
  return isManagedEnvironment() || Boolean(env.FIRESTORE_EMULATOR_HOST?.trim());
}
