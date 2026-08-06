import sharp from "sharp";
import { statSync } from "node:fs";

const OUT = "/Users/crissantiago/Documents/AI/Upskill-AI-Labs/docs/assets/social-card.png";
const SHOT = "/Users/crissantiago/Documents/AI/Upskill-AI-Labs/docs/assets/screenshots/today.png";

const W = 1200;
const H = 630;

// The screenshot bleeds off the right edge inside a rounded window, so the card
// shows the real product rather than a stylised illustration of it.
const shotWidth = 620;
const shot = await sharp(SHOT)
  .resize({ width: shotWidth, height: 400, fit: "cover", position: "top" })
  .composite([
    {
      input: Buffer.from(
        `<svg width="${shotWidth}" height="400"><rect width="${shotWidth}" height="400" rx="12" ry="12" fill="#fff"/></svg>`,
      ),
      blend: "dest-in",
    },
  ])
  .png()
  .toBuffer();

const layer = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#244a41"/>
      <stop offset="1" stop-color="#0e211d"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="1120" cy="86" r="220" fill="#2d5a4d" opacity="0.5"/>
  <g font-family="Helvetica Neue, Helvetica, Arial, sans-serif">
    <rect x="72" y="86" width="34" height="3" fill="#d6a85a"/>
    <text x="118" y="93" fill="#d6a85a" font-size="17" font-weight="700" letter-spacing="3.4">TRAINING FOR AI-FIRST WORK</text>
    <text x="72" y="196" fill="#ffffff" font-size="70" font-weight="700" letter-spacing="-3">Upskill AI Labs</text>
    <text x="72" y="268" fill="#d8e6e0" font-size="31" font-weight="500">Nine modules. Eight assessed labs.</text>
    <text x="72" y="312" fill="#d8e6e0" font-size="31" font-weight="500">Evidence instead of a certificate.</text>
    <g font-size="18" font-weight="600" fill="#a6c3b9">
      <text x="72" y="404">Copilot</text>
      <text x="176" y="404">Gemini</text>
      <text x="272" y="404">Claude</text>
      <text x="366" y="404">ChatGPT</text>
      <text x="474" y="404">Ollama</text>
    </g>
    <rect x="72" y="424" width="470" height="1" fill="#3a5d53"/>
    <text x="72" y="470" fill="#a6c3b9" font-size="18" font-weight="500">santiagomode.github.io/Upskill-AI-Labs</text>
  </g>
</svg>`;

await sharp(Buffer.from(layer))
  .composite([{ input: shot, top: 216, left: 640 }])
  .png({ compressionLevel: 9, quality: 92, effort: 10 })
  .toFile(OUT);

console.log(`social-card.png ${Math.round(statSync(OUT).size / 1024)} KB`);
