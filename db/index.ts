import { FirestoreOrm } from "./firestore-orm";

let database: FirestoreOrm | null = null;

export function getDb() {
  return database ??= new FirestoreOrm();
}
