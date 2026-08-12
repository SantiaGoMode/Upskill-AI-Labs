import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestore: Firestore | null = null;

export function getAdminApp(): App {
  return getApps()[0] ?? initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "processbridge",
  });
}

/**
 * Returns the process-wide Admin SDK client used by App Hosting and the local
 * Firestore emulator. Local development without the emulator never calls this.
 */
export function getAdminFirestore() {
  if (firestore) return firestore;
  firestore = getFirestore(getAdminApp());
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}
