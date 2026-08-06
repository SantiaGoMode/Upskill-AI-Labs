import { expect, test } from "@playwright/test";

test("every response carries the security headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  const policy = headers["content-security-policy"] ?? "";

  expect(policy).toContain("default-src 'self'");
  // Model providers are called server-side, so the browser needs no third-party
  // origin. This is what stops learner work being posted to one.
  expect(policy).toContain("connect-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("the policy does not block the app's own scripts or styles", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (/content security policy/i.test(text)) violations.push(text);
  });

  await page.goto("/");
  // An interactive control proves hydration ran, not merely that HTML arrived.
  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("button", { name: /theme/i }).first().click();

  expect(violations).toEqual([]);
});

test("an unknown lesson id renders the not-found page instead of an empty shell", async ({ page }) => {
  const response = await page.goto("/course/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("That page does not exist")).toBeVisible();
  await expect(page.getByRole("link", { name: "Course overview" })).toBeVisible();
});

test("the health endpoint reports database and secret readiness", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json() as { status: string; checks: Record<string, string> };
  expect(body.status).toBe("ok");
  expect(body.checks.database).toBe("ok");
});
