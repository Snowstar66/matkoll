#!/usr/bin/env node
// Renders a recipe text from tests/fixtures/ai/ as a cookbook-like page and saves
// a PNG next to it, for the image cases of the AI test set (`pnpm eval:ai`) and
// the mock. The first line is the title, lines that end a section ("Ingredienser",
// "Gör så här" …) become headings, and list markers are dropped.
//
//   node scripts/render-recipe-image.mjs [name]     # default: ugnspannkaka
//
// Needs Playwright's Chromium (`pnpm exec playwright install chromium`).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const name = process.argv[2] ?? "ugnspannkaka";
if (!/^[a-z0-9-]+$/.test(name)) {
  console.error("Name must be a fixture name such as ugnspannkaka.");
  process.exit(1);
}

const dir = fileURLToPath(new URL("../tests/fixtures/ai/", import.meta.url));
const text = readFileSync(`${dir}${name}.txt`, "utf8");

const escape = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const headings = /^(ingredienser|instruktioner|gör så här|så här gör du|du behöver)\s*:?$/i;
const [title, ...rest] = text.trim().split("\n");
const body = rest
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    if (headings.test(line)) return `<h2>${escape(line.replace(/:$/, ""))}</h2>`;
    return `<p>${escape(line.replace(/^[*-]\s+/, ""))}</p>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="sv"><head><meta charset="utf-8"><style>
  body { margin: 0; background: #f4efe4; }
  main { width: 640px; padding: 56px 64px; font: 19px/1.5 Georgia, "Times New Roman", serif; color: #2b2620; }
  h1 { font-size: 34px; line-height: 1.2; margin: 0 0 24px; }
  h2 { font-size: 15px; letter-spacing: 0.12em; text-transform: uppercase; margin: 28px 0 8px; }
  p { margin: 0 0 6px; }
</style></head>
<body><main><h1>${escape(title.trim())}</h1>
${body}
</main></body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 600 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  const out = `${dir}${name}.png`;
  await page.locator("main").screenshot({ path: out });
  console.log(`Wrote tests/fixtures/ai/${name}.png`);
} finally {
  await browser.close();
}
