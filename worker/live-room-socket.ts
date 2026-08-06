/**
 * Live Room notification channel.
 *
 * One Durable Object per cohort session. It holds the participants' WebSockets and
 * broadcasts a signal when the room changes; D1 remains the source of truth and
 * clients refetch through the existing authorized API. Keeping room state out of the
 * object means the REST route's access checks, redaction, and audit trail continue to
 * apply to every read, and a dropped socket can only ever cost a client freshness.
 *
 * Sockets are accepted through the hibernation API, so an idle room between sessions
 * holds no billable duration.
 */

export type LiveRoomMessage =
  | { type: "hello" }
  | { type: "changed"; action: string }
  | { type: "pong" };

export class LiveRoomSocket {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/broadcast")) {
      const { action } = await request.json() as { action?: string };
      this.broadcast({ type: "changed", action: action ?? "update" });
      return Response.json({ delivered: this.state.getWebSockets().length });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    server.send(JSON.stringify({ type: "hello" } satisfies LiveRoomMessage));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Clients send a keepalive; nothing else is accepted over the socket. */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (typeof message === "string" && message === "ping") {
      ws.send(JSON.stringify({ type: "pong" } satisfies LiveRoomMessage));
    }
  }

  webSocketError(ws: WebSocket) {
    try {
      ws.close(1011, "socket error");
    } catch {
      // Already gone; the runtime drops it either way.
    }
  }

  private broadcast(message: LiveRoomMessage) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A socket that cannot be written to is closing; the next poll recovers it.
      }
    }
  }
}
