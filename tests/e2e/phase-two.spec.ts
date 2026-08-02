import { expect, test } from "@playwright/test";

test("learner can open BYOJ and see the client-side privacy boundary", async ({ page }) => {
  const providerConfig = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/"); await providerConfig;
  await page.getByRole("button", { name: "Phase 2" }).click();
  const dialog = page.getByRole("dialog", { name: "From practice to workplace transfer" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Raw text stays in this browser.")).toBeVisible();
  await dialog.getByLabel("Paste a representative artifact").fill("# Weekly status\nOwner: person@example.com\nBudget: $50\n- Risk");
  await expect(dialog.getByText("Safe shape preview")).toBeVisible();
  await expect(dialog.getByText(/1 email/)).toBeVisible();
});

test("local facilitator can open account and cohort workspaces", async ({ page }) => {
  const providerConfig = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/"); await providerConfig;
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("dialog", { name: "Local learner" })).toBeVisible();
  await page.getByRole("button", { name: "Close account" }).click();
  await page.getByRole("button", { name: "Phase 2" }).click();
  await page.getByRole("button", { name: "Cohorts" }).click();
  await expect(page.getByText("Trainer cohort workspace")).toBeVisible();
});

test("facilitator can open a session and control the Live Room", async ({ page }) => {
  const session = { id: "session-ui", title: "Evidence workshop", scheduledAt: "2026-08-12T16:00:00.000Z", durationMinutes: 60, agenda: "Test prompts together.", status: "scheduled" };
  const room = { id: "room-ui", status: "open", currentLabId: "lab-01", currentSection: "Intake and structure", sharedPrompt: "", updatedAt: new Date().toISOString() };
  await page.route("**/api/cohorts", async (route) => route.fulfill({ json: { identity: { email: "trainer@example.com", displayName: "Trainer", role: "facilitator" }, organization: { id: "org-ui", name: "Practice organization" }, cohorts: [{ id: "cohort-ui", name: "Pilot cohort", status: "active", curriculum: { name: "AI-first work", version: 1 }, learners: [], sessions: [session], outcome: { invited: 0, enrolled: 0, completed: 0, passedLabs: 0, totalSubmissions: 0 } }] } }));
  await page.route("**/api/live-room**", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { identity: { email: "trainer@example.com", displayName: "Trainer", role: "facilitator" }, facilitator: true, session: { ...session, cohortName: "Pilot cohort" }, room: null, participants: [], cards: [] } });
    const body = route.request().postDataJSON();
    if (body.action === "share-prompt") room.sharedPrompt = body.prompt;
    return route.fulfill({ status: body.action === "open-room" ? 201 : 200, json: { identity: { email: "trainer@example.com", displayName: "Trainer", role: "facilitator" }, facilitator: true, session: { ...session, cohortName: "Pilot cohort" }, room, participants: [{ id: "participant-ui", userEmail: "trainer@example.com", displayName: "Trainer", role: "facilitator", status: "present" }], cards: [] } });
  });
  const providerConfig = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/"); await providerConfig;
  await page.getByRole("button", { name: "Phase 2" }).click();
  await page.getByRole("button", { name: "Cohorts" }).click();
  await page.getByRole("button", { name: "Open Live Room" }).click();
  const liveRoom = page.getByRole("dialog", { name: "Evidence workshop" });
  await expect(liveRoom).toBeVisible();
  await liveRoom.getByRole("button", { name: "Open Live Room" }).click();
  await expect(page.getByText("Lesson progression")).toBeVisible();
  await expect(page.getByText("Section whiteboard")).toBeVisible();
  await page.getByPlaceholder("Share a prompt for everyone to test…").fill("Compare the claims against the evidence.");
  await page.getByRole("button", { name: "Share with room" }).click();
  await expect(page.getByText("Compare the claims against the evidence.")).toBeVisible();
});
