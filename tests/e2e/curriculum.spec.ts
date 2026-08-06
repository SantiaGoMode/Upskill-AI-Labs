import { expect, test } from "@playwright/test";

test("learner reaches a lab from Today and the work becomes a durable attempt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();

  await page.getByRole("link", { name: /Weekly status/i }).first().click();
  await expect(page).toHaveURL(/\/lab\/lab-02$/);
  await expect(page.getByRole("heading", { name: "Write the weekly status from evidence" })).toBeVisible();

  // The lab opens on the brief and steps through to the deliverable.
  await expect(page.getByText("How to work through it")).toBeVisible();
  await page.getByRole("button", { name: /Draft\s*Write the deliverable/ }).click();

  // Typing into the deliverable promotes the local draft into a server-side attempt.
  await page.getByLabel("Overall RAG status").fill("Amber");
  await expect(page.getByText("Saved to lab record")).toBeVisible({ timeout: 15_000 });

  // The attempt shows up on the account record.
  await page.getByRole("link", { name: /Facilitator|Learner|Sign in/ }).click();
  await expect(page).toHaveURL(/\/account/);
  await expect(page.getByText(/Lab 2 · Write the weekly status/i).first()).toBeVisible();
});

test("the lab rail moves between labs with real URLs", async ({ page }) => {
  await page.goto("/lab/lab-01");
  await expect(page.getByRole("heading", { name: "Triage the Beacon intake" })).toBeVisible();

  await page.getByRole("navigation", { name: "Curriculum" }).getByRole("link", { name: /Promotion call/i }).click();
  await expect(page).toHaveURL(/\/lab\/lab-08$/);
  await expect(page.getByRole("heading", { name: "Evaluate and promote the workflow" })).toBeVisible();
});

test("the AI workbench blocks the confidential source and exposes the batch runner", async ({ page }) => {
  // The lab runner fetches provider config once it has mounted on the client, so
  // waiting for it guarantees the pane switch below lands on a hydrated button.
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/lab/lab-01");
  await hydrated;
  await page.getByRole("button", { name: /Workbench\s*Build and test a prompt/ }).click();

  await expect(page.getByText("Blocked by policy — confidential data")).toBeVisible();
  await expect(page.getByRole("checkbox").first()).toBeDisabled();

  // The 20-case reliability set is a first-class panel, not a hidden detail.
  await expect(page.getByRole("heading", { name: "Run this prompt against 20 cases" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dry check" })).toBeDisabled();

  await page.getByPlaceholder(/Define the output shape/).fill(
    "Extract only from the supplied sources. Cite every source ID. Report conflicts without averaging. Use Unknown when evidence is absent.",
  );
  await page.getByRole("button", { name: "Dry check" }).click();
  await expect(page.getByText(/\/20/)).toBeVisible({ timeout: 20_000 });
});

test("evidence renders as artifacts, not undifferentiated prose", async ({ page }) => {
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/lab/lab-02");
  await hydrated;
  await page.getByRole("button", { name: /Start the lab/ }).click();

  // A dashboard renders as tiles with targets, not bullets.
  await page.getByRole("button", { name: /Test dashboard/ }).click();
  await expect(page.getByText("Dashboard", { exact: true })).toBeVisible();
  await expect(page.getByText("target 95%")).toBeVisible();
  await expect(page.getByText("target 100% by Aug 5")).toBeVisible();

  // A plan renders as a timeline with per-milestone status.
  await page.getByRole("button", { name: /Milestone plan/ }).click();
  await expect(page.getByText("Planned August 5 · forecast August 9")).toBeVisible();
  await expect(page.getByText("At risk").first()).toBeVisible();

  // Reading a source is tracked.
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.getByRole("button", { name: "Reviewed ✓" })).toBeVisible();
});

test("the draft stage offers citation chips and blocks submission until pre-flight passes", async ({ page }) => {
  const hydrated = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/lab/lab-02");
  await hydrated;
  await page.getByRole("button", { name: /Draft\s*Write the deliverable/ }).click();

  await expect(page.getByText("Pre-flight checks")).toBeVisible();
  await expect(page.getByText("2 blocking")).toBeVisible();

  // Clicking a source chip cites it into the field.
  const rationale = page.getByLabel("Evidence-linked status rationale");
  await rationale.fill("Rehearsal slips to August 9");
  await page.getByRole("button", { name: "NW-UPDATE-B", exact: true }).nth(1).click();
  await expect(rationale).toHaveValue(/\[NW-UPDATE-B\]/);

  // Mark Unknown fills the field with exactly Unknown.
  await page.getByRole("button", { name: "Mark Unknown" }).first().click();
  await expect(page.getByLabel("Overall RAG status")).toHaveValue("Unknown");
});
