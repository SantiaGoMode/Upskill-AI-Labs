import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: {
    "oai-authenticated-user-email": "browser-admin@example.com",
    "oai-authenticated-user-role": "admin",
  },
});

test("administrator can add and disable a Google account from the user page", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "User access" })).toBeVisible();
  await page.getByLabel("Google email").fill("browser-student@example.com");
  await page.getByLabel("Display name").fill("Browser Student");
  await page.getByLabel("Role").selectOption("learner");
  await page.getByRole("button", { name: "Save access" }).click();

  await expect(page.getByText(/browser-student@example.com can now sign in/)).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "browser-student@example.com" });
  await expect(row).toContainText("student");
  await row.getByRole("button", { name: "Disable" }).click();
  await expect(row).toContainText("disabled");
});
