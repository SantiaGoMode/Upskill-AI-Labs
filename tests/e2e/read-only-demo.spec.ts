import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: {
    "oai-authenticated-user-email": "public-demo@upskill.invalid",
    "oai-authenticated-user-role": "viewer",
  },
});

test("public demo can browse content but cannot take quizzes or labs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Read-only demo · browse the course/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Demo" })).toBeVisible();

  await page.goto("/course/m1/m1-l5");
  await expect(page.getByText(/answers and submission are disabled in read-only mode/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit answers" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /A usable record/ })).toBeDisabled();

  await page.goto("/lab/lab-01");
  await expect(page.getByText("Read-only demo", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Timers, drafting, model runs, submissions/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Begin lab/i })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Lab sources" })).toBeVisible();
});
