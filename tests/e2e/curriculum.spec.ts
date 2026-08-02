import { expect, test } from "@playwright/test";

test("learner can open Lab 2, save work, and resume it from history", async ({ page }) => {
  const providerConfig = page.waitForResponse((response) =>
    response.url().includes("/api/model-runs?config=providers"),
  );
  await page.goto("/");
  await providerConfig;
  await expect(page.getByRole("navigation", { name: "Program curriculum" })).toBeVisible();
  await page.getByRole("button", { name: /weekly status from evidence/i }).click();
  await expect(page.getByRole("heading", { name: "Write the weekly status from evidence" })).toBeVisible();

  await page.getByLabel("Overall RAG status").fill("Amber");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Durable attempt")).toBeVisible();

  await page.getByRole("button", { name: "Attempt history" }).click();
  await expect(page.getByRole("dialog", { name: /local learner/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lab 02/i }).first()).toBeVisible();
});

test("learner can reach Lab 8 and open facilitator calibration", async ({ page }) => {
  const providerConfig = page.waitForResponse((response) => response.url().includes("/api/model-runs?config=providers"));
  await page.goto("/");
  await providerConfig;
  await page.getByRole("button", { name: /workflow/i }).last().click();
  await expect(page.getByRole("heading", { name: "Evaluate and promote the workflow" })).toBeVisible();
  await page.getByRole("button", { name: "Facilitator" }).click();
  await expect(page.getByRole("dialog", { name: "Facilitator calibration" })).toBeVisible();
  await expect(page.getByText("Appeal rate")).toBeVisible();
});
