import { getDb } from ".";
import { labAttempts } from "./schema";

let initialization: Promise<void> | null = null;

/**
 * Firestore is schema-less, so readiness means the configured adapter can answer a
 * read. Local development uses the in-process adapter unless the Firestore emulator
 * is explicitly configured; App Hosting uses Application Default Credentials.
 */
export function ensureLabSchema() {
  if (!initialization) {
    initialization = getDb().select({ id: labAttempts.id }).from(labAttempts).limit(1)
      .then(() => undefined)
      .catch((cause: unknown) => {
        initialization = null;
        throw cause;
      });
  }
  return initialization;
}
