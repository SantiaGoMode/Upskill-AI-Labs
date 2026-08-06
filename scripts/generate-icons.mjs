import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

/**
 * Builds the desktop application icons from the brand mark.
 *
 * The mark in `docs/assets/labs-mark.svg` stays the single source of truth, so the
 * app icon cannot drift from the one in the header. Run this after changing it:
 *
 *   npm run icons
 *
 * Output lands in `build/`, which electron-builder reads by convention.
 */

const root = path.join(import.meta.dirname, "..");
const source = path.join(root, "docs", "assets", "labs-mark.svg");
const outDir = path.join(root, "build");

const CANVAS = 1024;
/**
 * The mark is itself a rounded tile, so it is inset rather than bled to the edge:
 * macOS composites app icons on a grid where full-bleed artwork looks oversized
 * next to system icons.
 */
const INSET = Math.round(CANVAS * 0.08);

const markSvg = fs.readFileSync(source);

async function renderMaster() {
  const mark = await sharp(markSvg, { density: 512 })
    .resize(CANVAS - INSET * 2, CANVAS - INSET * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, top: INSET, left: INSET }])
    .png()
    .toBuffer();
}

/** macOS wants a .icns; iconutil builds one from a named iconset directory. */
async function writeIcns(master) {
  if (process.platform !== "darwin") {
    console.log("• skipped icon.icns (iconutil is macOS only)");
    return;
  }
  const iconset = fs.mkdtempSync(path.join(os.tmpdir(), "upskill-iconset-"));
  const dir = path.join(iconset, "icon.iconset");
  fs.mkdirSync(dir);

  for (const size of [16, 32, 128, 256, 512]) {
    await sharp(master).resize(size, size).png().toFile(path.join(dir, `icon_${size}x${size}.png`));
    await sharp(master).resize(size * 2, size * 2).png().toFile(path.join(dir, `icon_${size}x${size}@2x.png`));
  }

  execFileSync("iconutil", ["-c", "icns", dir, "-o", path.join(outDir, "icon.icns")]);
  fs.rmSync(iconset, { recursive: true, force: true });
  console.log("• build/icon.icns");
}

fs.mkdirSync(outDir, { recursive: true });
const master = await renderMaster();

// electron-builder converts this for Windows and uses it directly for Linux.
fs.writeFileSync(path.join(outDir, "icon.png"), master);
console.log(`• build/icon.png (${CANVAS}x${CANVAS})`);

await writeIcns(master);
