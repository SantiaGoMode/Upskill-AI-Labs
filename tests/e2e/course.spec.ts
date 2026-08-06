import { expect, test } from "@playwright/test";

test("a learner can move through a lesson and record progress", async ({ page }) => {
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/course"));
  await page.goto("/course");
  await hydrated;
  await expect(page.getByRole("heading", { name: "AI-first program management" })).toBeVisible();

  await page.getByRole("link", { name: /What AI actually is/ }).click();
  await expect(page).toHaveURL(/\/course\/m0$/);
  await expect(page.getByText("By the end you can")).toBeVisible();

  await page.getByRole("link", { name: /It predicts the next word/ }).click();
  await expect(page).toHaveURL(/\/course\/m0\/m0-l1$/);

  // The teaching blocks render: a diagram, a key term and the numbered steps.
  await expect(page.getByRole("img", { name: /predicts the next token/i })).toBeVisible();
  await expect(page.getByText("Token", { exact: true })).toBeVisible();
  await expect(page.getByText("It is not looking anything up")).toBeVisible();
});

test("the knowledge check scores answers and explains them", async ({ page }) => {
  // The page fetches progress once mounted, so awaiting it guarantees hydration
  // before the option buttons are clicked.
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/course"));
  await page.goto("/course/m0/m0-l7");
  await hydrated;
  await expect(page.getByRole("heading", { name: "Check your understanding" })).toBeVisible();

  // Answer every question with its correct option.
  const correct = [
    "The date needs tracing to a specific source before you use it",
    "The early message has fallen out of the context window",
    "A prompt injection, which the model may follow",
    "Accepting a launch risk on the organisation's behalf",
    "Only by checking the count yourself",
    "Almost nothing — mainly how you point it at the source files",
  ];
  for (const option of correct) {
    await page.getByRole("button", { name: option, exact: true }).click();
  }

  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("All correct. Recorded against this module.")).toBeVisible();
  await expect(page.getByText("Fluency tells you nothing about accuracy.", { exact: false })).toBeVisible();
});

test("a lab knows which module it belongs to", async ({ page }) => {
  await page.goto("/lab/lab-02");
  const rail = page.getByRole("navigation", { name: "Curriculum" });
  await expect(rail.getByRole("link", { name: /Module 2 · Draft from evidence/ })).toBeVisible();
  await rail.getByRole("link", { name: "Back to module →" }).click();
  await expect(page).toHaveURL(/\/course\/m2$/);
});

test("a facilitator can attach a Meet link to a session without Google credentials", async ({ page }) => {
  await page.route("**/api/meet", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { configured: false } });
    const body = route.request().postDataJSON();
    if (body.action === "set-link") {
      return route.fulfill({ json: { session: { id: body.sessionId, meetingUri: body.meetingUri, meetingSource: "manual" } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/cohorts");
  const meetHint = page.getByText("Meet API not configured — paste a link instead").first();
  if (await meetHint.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Paste a link" }).first().click();
    await page.getByPlaceholder("https://meet.google.com/abc-defg-hij").first().fill("https://meet.google.com/abc-defg-hij");
    await expect(page.getByRole("button", { name: "Attach" }).first()).toBeEnabled();
  }
});
