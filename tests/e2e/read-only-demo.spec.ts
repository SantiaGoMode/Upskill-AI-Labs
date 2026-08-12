import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: {
    "oai-authenticated-user-email": "public-demo@upskill.invalid",
    "oai-authenticated-user-role": "viewer",
  },
});

test("public demo looks like an active course but cannot change its record", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Read-only demo · browse the course/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Demo", exact: true })).toBeVisible();
  await expect(page.getByText("5 of 8 labs submitted")).toBeVisible();
  await expect(page.getByText("Attempts on record").locator("..").getByText("6", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scheduled sessions" })).toBeVisible();
  await expect(page.getByText("Lab 6 coaching studio")).toBeVisible();
  await expect(page.getByText("Executive narrative critique")).toBeVisible();

  await page.goto("/course");
  await expect(page.getByText("Course complete")).toHaveCount(0);
  await expect(page.getByText("Module 5", { exact: false }).first()).toBeVisible();

  await page.goto("/path");
  await expect(page.getByRole("heading", { name: "My pathway" })).toBeVisible();
  await expect(page.getByText("Your three priority workflows")).toBeVisible();
  await expect(page.getByText(/Build and regression-test the status jig/)).toBeVisible();
  await expect(page.getByRole("link", { name: /redo intake|start intake/i })).toHaveCount(0);

  await page.goto("/ledger");
  await expect(page.getByRole("heading", { name: "Capability ledger" })).toBeVisible();
  await expect(page.getByText("risk synthesis", { exact: true })).toBeVisible();
  await expect(page.getByText(/baseline 135 minutes, target 75 minutes/)).toBeVisible();
  await expect(page.getByRole("button", { name: /refresh|record baseline|re-measure/i })).toHaveCount(0);

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "The tools you built" })).toBeVisible();
  await expect(page.getByText("STATUS-JIG v0.7", { exact: false })).toBeVisible();

  const liveRoomWrites: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/live-room") liveRoomWrites.push(request.url());
  });
  await page.goto("/room/demo-session-coaching");
  await expect(page.getByText("Lab 6 coaching studio")).toBeVisible();
  await expect(page.getByText("Read-only room preview", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/STATUS-JIG v0.7/).first()).toBeVisible();
  await expect(page.getByText("Model output", { exact: true })).toBeVisible();
  await expect(page.getByText(/Waiting for the facilitator/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /open live room/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /run|delete|add to canvas/i })).toHaveCount(0);
  await page.getByRole("button", { name: "List" }).click();
  await expect(page.getByText(/NW-WEEK-10 · Week 10 source pack/)).toBeVisible();
  expect(liveRoomWrites).toEqual([]);

  await page.goto("/course/m1/m1-l5");
  await expect(page.getByText(/answers and submission are disabled in read-only mode/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answers" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /A usable record/ })).toBeDisabled();

  await page.goto("/lab/lab-01");
  await expect(page.getByText("Read-only demo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Timers, drafting, model runs, submissions/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Begin lab/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Lab sources" })).toBeVisible();

  const write = await page.request.post("/api/capabilities", { data: { action: "refresh-claims" } });
  expect(write.status()).toBe(401);
});
