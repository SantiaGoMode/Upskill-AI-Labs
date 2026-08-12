import { expect, test } from "@playwright/test";
import { openRoom } from "../support/rooms";

/** Collects SSE payloads until `count` arrive or the timeout elapses. */
async function collect(url: string, count: number, onOpen?: () => Promise<void>, timeoutMs = 8_000) {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok || !response.body) return [`status:${response.status}`];

  const messages: string[] = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let opened = false;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    while (messages.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const payload = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
        if (!payload) continue;
        messages.push(payload);
        if (!opened) {
          opened = true;
          await onOpen?.();
        }
      }
    }
  } catch (error) {
    if (!(error instanceof Error) || error.name !== "AbortError") throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
  return messages;
}

test("the channel refuses a caller who cannot read the session", async ({ baseURL }) => {
  // No stream is established, which means authorization ran before the request
  // reached the session's channel. Rejection of a caller who is authenticated but
  // outside the cohort is covered in tests/e2e/live-room-channel.spec.ts, where a
  // browser can carry that learner's session cookie through the handshake.
  expect(await collect(`${baseURL}/api/live-room/channel?sessionId=does-not-exist`, 1)).toContain("status:404");
});

test("the channel requires a session id", async ({ request }) => {
  const response = await request.get("/api/live-room/channel");
  expect(response.status()).toBe(400);
});

test("a room change is pushed to a connected participant", async ({ request, baseURL }) => {
  const sessionId = await openRoom(request, "channel-broadcast");
  const messages = await collect(
    `${baseURL}/api/live-room/channel?sessionId=${sessionId}`,
    2,
    // Fires once the greeting confirms the stream is live.
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
  // Heartbeats are frequent and change nothing others can see, so waking every
  // participant for one would defeat the point of the channel.
  const messages = await collect(
    `${baseURL}/api/live-room/channel?sessionId=${sessionId}`,
    2,
    async () => {
      await request.post("/api/live-room", { data: { action: "heartbeat", sessionId } });
    },
    1_500,
  );

  expect(messages[0]).toContain("hello");
  // Only the collector's own timeout marker should follow, never a change signal.
  expect(messages.filter((message) => message.includes("changed"))).toEqual([]);
});
