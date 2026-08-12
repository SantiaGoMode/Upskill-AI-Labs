import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyAAlqyZW6_6RIzHqTH5VpTm2M2U6i807lE",
  authDomain: "processbridge.firebaseapp.com",
  projectId: "processbridge",
  storageBucket: "processbridge.firebasestorage.app",
  messagingSenderId: "1010325255396",
  appId: "1:1010325255396:web:a9ef6a62cb6b64d86ee8f1",
  measurementId: "G-3LDMBXD2QH",
} as const;

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const firebaseAuth = () => getAuth(firebaseApp);

export async function signInWithGoogle() {
  const result = await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
  return result.user.getIdToken();
}

export async function signOutOfFirebase() {
  await signOut(firebaseAuth());
}

/** Listen to the signal document only; room state still comes from the authorized API. */
export function subscribeToFirebaseRoomSignal(sessionId: string, onOpen: () => void, onChange: () => void, onError: () => void) {
  let initial = true;
  return onSnapshot(doc(getFirestore(firebaseApp), "_live_room_signals", sessionId), () => {
    onOpen();
    if (initial) initial = false;
    else onChange();
  }, onError);
}

/** Analytics is opt-in, so local development and automated tests make no cloud calls. */
export async function initializeFirebaseAnalytics() {
  if (process.env.NEXT_PUBLIC_FIREBASE_ANALYTICS_ENABLED !== "true") return null;
  if (typeof window === "undefined" || !await isSupported()) return null;
  return getAnalytics(firebaseApp);
}
