#!/usr/bin/env node
// Renders the synthetic photos of a place at home for the mock's analyzeImage
// fixtures (tests/fixtures/ai/<name>.png): CSS shapes with printed labels,
// never a real photo, since the repo is public. "kyl" is an open fridge with
// mellanmjölk, vispgrädde, smör, six eggs, two cucumbers and ketchup (the six
// items in kyl.analyze.json); "tom-hylla" is an empty shelf. Both stay well
// under 1600 px and 1.5 MB, so the client sends them unchanged and the mock
// knows them by their bytes. Rendering again changes the bytes: the mock then
// answers them anew, but update nothing else.
//
//   node scripts/render-pantry-image.mjs [kyl|tom-hylla]   # default: both
//
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`).

import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const style = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #d9dde0; font-family: Arial, Helvetica, sans-serif; }
  main { width: 720px; height: 900px; padding: 28px; background: #eef2f4; border: 14px solid #c9ced2; border-radius: 18px;
         display: flex; flex-direction: column; justify-content: space-between; }
  .shelf { height: 250px; display: flex; align-items: flex-end; gap: 22px; padding: 0 18px;
           border-bottom: 10px solid rgba(160, 190, 205, 0.8); }
  .label { font-weight: bold; text-align: center; line-height: 1.15; }
  .carton { width: 160px; height: 210px; border-radius: 6px 6px 3px 3px; display: flex; flex-direction: column;
            justify-content: center; padding: 8px; }
  .milk { background: #ffffff; border: 3px solid #2c6fb7; color: #1d4f8a; font-size: 22px; }
  .cream { width: 140px; height: 150px; background: #fff6d6; border: 3px solid #c9a227; color: #6d5310; font-size: 19px; }
  .butter { width: 150px; height: 90px; background: #f7e27a; border: 3px solid #b8961c; color: #5a4605; font-size: 22px;
            border-radius: 8px; display: flex; flex-direction: column; justify-content: center; }
  .eggs { width: 300px; height: 100px; background: #c8b48f; border-radius: 8px; display: grid;
          grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 8px; }
  .egg { background: #f3e6cf; border-radius: 50% 50% 46% 46% / 60% 60% 40% 40%; border: 2px solid #d8c4a2; }
  .cucumbers { display: flex; flex-direction: column; gap: 10px; }
  .cucumber { width: 240px; height: 46px; background: #3f7d3a; border-radius: 23px; border: 3px solid #2b5a27; }
  .ketchup { width: 90px; height: 220px; background: #c62828; border-radius: 30px 30px 10px 10px; color: #fff;
             font-size: 20px; display: flex; align-items: center; justify-content: center; }
  .note { font-size: 15px; font-weight: normal; }
`;

const scenes = {
  kyl: `
    <div class="shelf">
      <div class="carton milk label">Mellanmjölk<br><span class="note">1,5 % · 1 liter</span></div>
      <div class="carton cream label">Vispgrädde<br><span class="note">3 dl</span></div>
      <div class="butter label">Smör<br><span class="note">500 g</span></div>
    </div>
    <div class="shelf">
      <div class="eggs">${'<div class="egg"></div>'.repeat(6)}</div>
      <div class="cucumbers"><div class="cucumber"></div><div class="cucumber"></div></div>
    </div>
    <div class="shelf">
      <div class="ketchup label">Ketchup</div>
    </div>`,
  "tom-hylla": `
    <div class="shelf"></div>
    <div class="shelf"></div>
    <div class="shelf"></div>`,
};

const wanted = process.argv[2];
if (wanted !== undefined && !(wanted in scenes)) {
  console.error(`Name must be one of: ${Object.keys(scenes).join(", ")}.`);
  process.exit(1);
}

const dir = fileURLToPath(new URL("../tests/fixtures/ai/", import.meta.url));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 1000 }, deviceScaleFactor: 1 });
  for (const name of wanted ? [wanted] : Object.keys(scenes)) {
    await page.setContent(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><style>${style}</style></head>
      <body><main>${scenes[name]}</main></body></html>`);
    await page.locator("main").screenshot({ path: `${dir}${name}.png` });
    console.log(`Wrote tests/fixtures/ai/${name}.png`);
  }
} finally {
  await browser.close();
}
