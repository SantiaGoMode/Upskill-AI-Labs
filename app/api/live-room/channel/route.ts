import { liveRoomAccess } from "../../../lib/live-room-access";
import { subscribeToLiveRoomSignals } from "../../../lib/live-room-signals";
import { getRequestIdentity, unauthorizedResponse } from "../../../lib/request-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const event = (value: object) => encoder.encode(`data: ${JSON.stringify(value)}\n\n`);

/** Authorized, state-free change channel for the Live Room. */
export async function GET(request: Request) {
  const identity = await getRequestIdentity(request);
  if (!identity) return unauthorizedResponse();

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
  if (!sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });
  if (!await liveRoomAccess(sessionId, identity)) {
    return Response.json({ error: "Live session not found" }, { status: 404 });
  }

  let stop = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        stop();
        try { controller.close(); } catch { /* stream already closed */ }
      };

      controller.enqueue(event({ type: "hello", sessionId }));
      stop = subscribeToLiveRoomSignals(sessionId, (signal) => {
        if (!closed) controller.enqueue(event({ type: "changed", action: signal.action }));
      });
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 25_000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
