import { expect, test } from "@playwright/test";
import { openRoom } from "../support/rooms";

/** Collects socket messages until `count` arrive or the timeout elapses. */
function collect(url: string, count: number, onOpen?: () => Promise<void>) {
  return new Promise<string[]>((resolve) => {
    const messages: string[] = [];
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve(["construct-failed"]);
      return;
    }
    // Work triggered from a socket callback has to finish before the test ends, or
    // Playwright disposes the request context under an in-flight call.
    let pending = Promise.resolve();
    const finish = async (extra?: string) => {
      if (extra) messages.push(extra);
      await pending.catch(() => { /* surfaced by the assertions instead */ });
      try { socket.close(); } catch { /* already closing */ }
      resolve(messages);
    };
    socket.addEventListener("message", (event) => {
      messages.push(String((event as MessageEvent).data));
      if (messages.length === 1 && onOpen) pending = pending.then(onOpen);
      if (messages.length >= count) void finish();
    });
    socket.addEventListener("error", () => void finish("error"));
    setTimeout(() => void finish(messages.length ? undefined : "timeout"), 8000);
  });
}

test("the channel refuses a socket for a session the caller cannot read", async ({ baseURL }) => {
  const wsBase = (baseURL ?? "http://localhost:3100").replace(/^http/, "ws");

  // No socket is established, which means authorization ran before the request
  // reached the session's channel. Rejection of a caller who is authenticated but
  // outside the cohort is covered in tests/e2e/live-room-channel.spec.ts, where a
  // browser can carry that learner's session cookie through the handshake.
  expect(await collect(`${wsBase}/api/live-room/socket?sessionId=does-not-exist`, 1)).toContain("error");
});

test("the socket endpoint rejects a plain request that is not an upgrade", async ({ request }) => {
  const response = await request.get("/api/live-room/socket?sessionId=anything");
  expect(response.status()).toBe(426);
});

test("a room change is pushed to a connected participant", async ({ request, baseURL }) => {
  const sessionId = await openRoom(request, "channel-broadcast");
  const wsBase = (baseURL ?? "http://localhost:3100").replace(/^http/, "ws");

  const messages = await collect(
    `${wsBase}/api/live-room/socket?sessionId=${sessionId}`,
    2,
    // Fires once the greeting confirms the socket is live.
    async () => {
      await request.post("/api/live-room", { data: { action: "share-prompt", sessionId, prompt: "Pushed to every participant." } });
    },
  );

  expect(messages[0]).toContain("hello");
  expect(messages[1]).toContain("changed");
  expect(messages[1]).toContain("share-prompt");
});

test("a presence heartbeat does not trigger a broadcast", async ({ request, baseURL }) => {
  const sessionId = await openRoom(request, "channel-quiet");
  const wsBase = (baseURL ?? "http://localhost:3100").replace(/^http/, "ws");

  // Heartbeats are frequent and change nothing others can see, so waking every
  // participant for one would defeat the point of the channel.
  const messages = await collect(
    `${wsBase}/api/live-room/socket?sessionId=${sessionId}`,
    2,
    async () => {
      await request.post("/api/live-room", { data: { action: "heartbeat", sessionId } });
    },
  );

  expect(messages[0]).toContain("hello");
  // Only the collector's own timeout marker should follow, never a change signal.
  expect(messages.filter((message) => message.includes("changed"))).toEqual([]);
});
