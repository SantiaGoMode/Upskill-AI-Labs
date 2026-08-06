"use client";

import { useEffect, useRef, useState } from "react";

/** Backoff between reconnection attempts, in milliseconds. */
const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000];
/** Keepalive cadence. Well inside any intermediary's idle timeout. */
const PING_MS = 25_000;

/**
 * Subscribes to a Live Room's change notifications.
 *
 * The socket carries no room state: it only says "something changed", and the caller
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
  const [socketOpen, setSocketOpen] = useState(false);
  // Held in a ref so a new callback identity does not tear down the socket.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let pingTimer = 0;
    let attempt = 0;
    let closed = false;

    const clearTimers = () => {
      window.clearTimeout(reconnectTimer);
      window.clearInterval(pingTimer);
    };

    const connect = () => {
      if (closed) return;
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      const url = `${scheme}://${window.location.host}/api/live-room/socket?sessionId=${encodeURIComponent(sessionId)}`;

      try {
        socket = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }

      socket.addEventListener("open", () => {
        if (closed) return;
        attempt = 0;
        setSocketOpen(true);
        pingTimer = window.setInterval(() => socket?.send("ping"), PING_MS);
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string };
          if (message.type === "changed") onChangeRef.current();
        } catch {
          // A message we cannot parse is not a reason to drop the channel.
        }
      });

      socket.addEventListener("close", () => {
        window.clearInterval(pingTimer);
        setSocketOpen(false);
        scheduleReconnect();
      });

      // 'error' is always followed by 'close', which owns the reconnect.
      socket.addEventListener("error", () => setSocketOpen(false));
    };

    const scheduleReconnect = () => {
      if (closed) return;
      const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
      attempt += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      closed = true;
      clearTimers();
      // The socket's own close handler clears the connected flag.
      socket?.close();
    };
  }, [enabled, sessionId]);

  // Derived rather than stored, so disabling the channel cannot leave a stale `true`.
  return { connected: enabled && socketOpen };
}
