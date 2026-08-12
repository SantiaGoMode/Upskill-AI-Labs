import { expect, test, type Page } from "@playwright/test";
import { createCohortRoom, openRoom } from "../support/rooms";

/**
 * Opens an event stream from inside the page and reports what happened. Running in the
 * browser carries the signed-in learner's session cookie through the request.
 */
function channelOutcome(page: Page, sessionId: string) {
  return page.evaluate((id) => new Promise<string>((resolve) => {
    const source = new EventSource(`/api/live-room/channel?sessionId=${encodeURIComponent(id)}`);
    source.addEventListener("message", () => { source.close(); resolve("connected"); });
    source.addEventListener("error", () => { source.close(); resolve("rejected"); });
    setTimeout(() => resolve("timeout"), 6000);
  }), sessionId);
}

test("the Live Room connects to its channel and receives a pushed change", async ({ page }) => {
  const sessionId = await openRoom(page.request, "browser-channel");

  await page.goto(`/room/${sessionId}`);

  // An active connection also means fallback polling is switched off, so anything
  // that arrives after this point arrived by push.
  await expect(page.getByRole("status", { name: "Live connection active" })).toBeVisible({ timeout: 15_000 });

  await page.request.post("/api/live-room", {
    data: { action: "share-prompt", sessionId, prompt: "Pushed without a reload." },
  });

  // Well under the 45s presence heartbeat, so a poll cannot account for it.
  await expect(page.getByText("Pushed without a reload.")).toBeVisible({ timeout: 8_000 });
});

test("a learner in another cohort cannot open a channel on someone else's session", async ({ page }) => {
  // Two independent cohorts, each with its own room and its own invited learner.
  const target = await createCohortRoom(page.request, "channel-target");
  const other = await createCohortRoom(page.request, "channel-outsider");

  // Sign in as the second cohort's learner. The session cookie lands in this browser
  // context, so the stream request below is made as that learner.
  const accepted = await page.request.post("/api/auth", {
    data: { action: "sign-in", inviteToken: other.inviteToken },
  });
  expect(accepted.status()).toBe(201);
  expect((await accepted.json()).identity.email).toBe("channel-outsider-learner@example.com");

  await page.goto("/account");
  await expect(page.getByText("channel-outsider-learner@example.com")).toBeVisible();

  // Their own room is reachable, so a rejection below is about access, not plumbing.
  expect(await channelOutcome(page, other.sessionId)).toBe("connected");
  expect(await channelOutcome(page, target.sessionId)).toBe("rejected");
});
