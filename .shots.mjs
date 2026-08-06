import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/private/tmp/claude-502/-Users-crissantiago-Documents-AI-Upskill-AI-Labs/e0b86f80-ff66-4652-9ce8-b649af453f6f/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const pages = [
  ["home", "/"],
  ["course", "/course"],
  ["module-0", "/course/m0"],
  ["lesson", "/course/m0/m0-l1"],
  ["quiz", "/course/m0/m0-l7"],
  ["lab", "/lab/lab-02"],
  ["onboarding", "/onboarding"],
  ["path", "/path"],
  ["library", "/library"],
  ["ledger", "/ledger"],
  ["governance", "/governance"],
  ["studio", "/studio"],
  ["cohorts", "/cohorts"],
  ["review", "/review"],
  ["account", "/account"],
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

for (const [name, path] of pages) {
  try {
    await page.goto(`http://localhost:3100${path}`, { waitUntil: "networkidle", timeout: 45000 });
  } catch {
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name, path);
}

await browser.close();
