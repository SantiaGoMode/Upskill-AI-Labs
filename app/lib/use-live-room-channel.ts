"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToFirebaseRoomSignal } from "./firebase-client";

/**
 * Subscribes to a Live Room's change notifications.
 *
 * The channel carries no room state: it only says "something changed", and the caller
 * refetches through the normal authorized API. That keeps redaction and access checks
 * on every read, and means a missed message costs freshness rather than correctness.
 *
 * `connected` is exposed so a caller can fall back to polling while the channel is
 * down instead of silently going stale.
 */
export function useLiveRoomChannel(
  sessionId: string,
  { enabled, onChange }: { enabled: boolean; onChange: () => void },
) {
  const [channelOpen, setChannelOpen] = useState(false);
  // Held in a ref so a new callback identity does not tear down the channel.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    if (process.env.NEXT_PUBLIC_FIREBASE_REALTIME_ENABLED === "true") {
      const unsubscribe = subscribeToFirebaseRoomSignal(
        sessionId,
        () => setChannelOpen(true),
        () => onChangeRef.current(),
        () => setChannelOpen(false),
      );
      return () => {
        unsubscribe();
        setChannelOpen(false);
      };
    }

    const source = new EventSource(`/api/live-room/channel?sessionId=${encodeURIComponent(sessionId)}`);
    source.addEventListener("open", () => setChannelOpen(true));
    source.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as { type?: string };
        if (message.type === "changed") onChangeRef.current();
      } catch {
        // A message we cannot parse is not a reason to drop the channel.
      }
    });
    source.addEventListener("error", () => setChannelOpen(false));

    return () => {
      source.close();
      setChannelOpen(false);
    };
  }, [enabled, sessionId]);

  // Derived rather than stored, so disabling the channel cannot leave a stale `true`.
  return { connected: enabled && channelOpen };
}
