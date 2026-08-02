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
