import { EventEmitter } from "node:events";
import { getAdminFirestore } from "../../db/firebase-admin";
import { isManagedEnvironment } from "./runtime-env";

type Signal = { action: string; nonce: string; sentAt: string };
type Listener = (signal: Signal) => void;

declare global {
  var __upskillLiveRoomSignals: EventEmitter | undefined;
}

const localBus = () => globalThis.__upskillLiveRoomSignals ??= new EventEmitter();
const channelName = (sessionId: string) => `room:${sessionId}`;

/** Publishes one small invalidation signal; room data remains behind the REST API. */
export async function publishLiveRoomSignal(sessionId: string, action: string) {
  const signal: Signal = { action, nonce: crypto.randomUUID(), sentAt: new Date().toISOString() };
  if (!isManagedEnvironment()) {
    localBus().emit(channelName(sessionId), signal);
    return;
  }

  await getAdminFirestore().collection("_live_room_signals").doc(sessionId).set(signal);
}

/**
 * Subscribes only while a participant has an open room. In production this is one
 * Firestore document listener; locally it is a zero-cost in-process event emitter.
 */
export function subscribeToLiveRoomSignals(sessionId: string, listener: Listener) {
  if (!isManagedEnvironment()) {
    const event = channelName(sessionId);
    localBus().on(event, listener);
    return () => localBus().off(event, listener);
  }

  let initial = true;
  return getAdminFirestore().collection("_live_room_signals").doc(sessionId).onSnapshot((snapshot) => {
    if (initial) {
      initial = false;
      return;
    }
    const value = snapshot.data() as Signal | undefined;
    if (value?.action) listener(value);
  });
}
