import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";

const SRC = "/private/tmp/claude-502/-Users-crissantiago-Documents-AI-Upskill-AI-Labs/e0b86f80-ff66-4652-9ce8-b649af453f6f/scratchpad/shots";
const OUT = "/Users/crissantiago/Documents/AI/Upskill-AI-Labs/docs/assets/screenshots";
mkdirSync(OUT, { recursive: true });

// Source shots are 2880x1800 (2x of a 1440x900 viewport). 1760 wide keeps UI text
// crisp on a retina display without shipping megabytes per image.
const wanted = [
  ["home", "today"],
  ["course", "course"],
  ["lesson", "lesson"],
  ["quiz-scored", "knowledge-check"],
  ["lab", "lab-brief"],
  ["lab-evidence-source", "lab-evidence"],
  ["lab-workbench", "lab-workbench"],
  ["lab-submit", "lab-preflight"],
  ["governance", "governance"],
  ["studio", "trainer-studio"],
  ["library", "prompt-library"],
];

let total = 0;
for (const [from, to] of wanted) {
  const target = `${OUT}/${to}.png`;
  await sharp(`${SRC}/${from}.png`)
    .resize({ width: 1760 })
    .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 })
    .toFile(target);
  const kb = Math.round(statSync(target).size / 1024);
  total += kb;
  console.log(`${to.padEnd(18)} ${kb} KB`);
}
console.log(`total ${Math.round(total / 1024 * 10) / 10} MB`);
