import { chromium } from "@playwright/test";

const OUT = "/private/tmp/claude-502/-Users-crissantiago-Documents-AI-Upskill-AI-Labs/e0b86f80-ff66-4652-9ce8-b649af453f6f/scratchpad/shots";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ── lab stages ───────────────────────────────────────────────
await page.goto("http://localhost:3100/lab/lab-02", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const stages = page.getByRole("navigation", { name: "Lab stages" });

for (const [stage, name] of [["Evidence", "lab-evidence"], ["Workbench", "lab-workbench"], ["Draft", "lab-draft"], ["Submit", "lab-submit"]]) {
  try {
    await stages.getByRole("button", { name: new RegExp(stage) }).click();
    await page.waitForTimeout(1400);
    await shot(name);
    console.log("captured", name);
  } catch (error) {
    console.log("FAILED", name, String(error).split("\n")[0]);
  }
}

// Evidence with a source open
try {
  await stages.getByRole("button", { name: /Evidence/ }).click();
  await page.waitForTimeout(800);
  const sources = page.getByRole("navigation", { name: "Lab sources" }).getByRole("button");
  await sources.nth(1).click();
  await page.waitForTimeout(1000);
  await shot("lab-evidence-source");
  console.log("captured lab-evidence-source");
} catch (error) {
  console.log("FAILED lab-evidence-source", String(error).split("\n")[0]);
}

// ── scored knowledge check ───────────────────────────────────
try {
  await page.goto("http://localhost:3100/course/m0/m0-l7", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
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
  await page.waitForTimeout(1200);
  await page.getByText("All correct").scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await shot("quiz-scored");
  console.log("captured quiz-scored");
} catch (error) {
  console.log("FAILED quiz-scored", String(error).split("\n")[0]);
}

await browser.close();
