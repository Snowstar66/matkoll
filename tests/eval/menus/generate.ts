// Renders the synthetic menus of menu-data.ts to images (Playwright) and writes the ground truth
// next to each image. Run: `node tests/eval/menus/generate.ts`. The images are checked in.
import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { menus, type MenuSpec, type TruthDish } from "./menu-data.ts";

const outDir = dirname(fileURLToPath(import.meta.url));
const symbols: Record<string, { sign: string; after: boolean }> = {
  EUR: { sign: "€", after: true },
  GBP: { sign: "£", after: false },
  USD: { sign: "$", after: false },
  SEK: { sign: "kr", after: true },
};

function formatPrice(price: number, currency: string, language: string): string {
  const { sign, after } = symbols[currency];
  const number = Number.isInteger(price)
    ? String(price)
    : language === "en"
      ? price.toFixed(2)
      : price.toFixed(2).replace(".", ",");
  return after ? `${number} ${sign}` : `${sign}${number}`;
}

const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function renderItem(spec: MenuSpec, item: TruthDish): string {
  const { priceMode } = spec.style;
  const price = item.price === null ? "" : formatPrice(item.price, item.currency, spec.language);
  const desc = item.desc ? `<div class="desc">${esc(item.desc)}</div>` : "";
  if (priceMode === "column") {
    return `<div class="row col"><div class="nm"><b>${esc(item.name)}</b>${desc}</div><div class="pr">${price}</div></div>`;
  }
  if (priceMode === "small") {
    return `<div class="row"><div class="nm"><b>${esc(item.name)}</b>${price ? ` <sup class="small">${price}</sup>` : ""}${desc}</div></div>`;
  }
  return `<div class="row inl"><div class="nm"><b>${esc(item.name)}</b>${desc}</div>${price ? `<span class="lead"></span><div class="pr">${price}</div>` : ""}</div>`;
}

function html(spec: MenuSpec): string {
  const s = spec.style;
  const d = s.degrade ?? {};
  const sections = spec.sections
    .map(
      (sec) =>
        `<section><h2>${esc(sec.title)}</h2>${sec.items.map((i) => renderItem(spec, i)).join("")}</section>`,
    )
    .join("");
  const chalk = s.texture === "chalk"
    ? "background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px); background-size: 6px 6px;"
    : "";
  const transforms = [
    d.perspective ? "perspective(1400px) rotateY(14deg) rotateX(4deg)" : "",
    d.rotate ? `rotate(${d.rotate}deg)` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const filter = [
    d.blur ? `blur(${d.blur}px)` : "",
    d.contrast ? `contrast(${d.contrast})` : "",
    d.brightness ? `brightness(${d.brightness})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const degraded = Object.keys(d).length > 0;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; background:${degraded ? "#6b5b4b" : s.bg}; }
    .stage { padding:${degraded ? 90 : 0}px; display:inline-block; }
    .menu { width:${s.width}px; box-sizing:border-box; padding:48px 56px; background:${s.bg}; color:${s.fg}; font-family:${s.font}; font-size:${s.fontSize}px; ${chalk}
      ${transforms ? `transform:${transforms};` : ""} ${filter ? `filter:${filter};` : ""}
      ${d.shadow ? "box-shadow: 18px 22px 40px rgba(0,0,0,.55), inset -120px -60px 120px rgba(0,0,0,.28);" : ""} }
    h1 { font-family:${s.headingFont}; color:${s.accent}; text-align:center; font-size:${Math.round(s.fontSize * 2)}px; margin:0 0 6px; font-weight:400; }
    .note { text-align:center; margin-bottom:26px; color:${s.accent}; font-size:${Math.round(s.fontSize * 0.95)}px; }
    .cols { column-count:${s.columns}; column-gap:56px; }
    section { break-inside:avoid-column; margin-bottom:22px; }
    h2 { font-family:${s.headingFont}; color:${s.accent}; font-size:${Math.round(s.fontSize * 1.4)}px; border-bottom:2px solid ${s.accent}; margin:0 0 10px; font-weight:400; letter-spacing:1px; }
    .row { margin:0 0 11px; line-height:1.25; }
    .inl { display:flex; align-items:baseline; gap:6px; }
    .inl .nm { flex:0 1 auto; }
    .lead { flex:1; border-bottom:2px dotted ${s.fg}55; min-width:20px; }
    .col { display:flex; justify-content:space-between; gap:20px; }
    .col .pr { white-space:nowrap; font-variant-numeric:tabular-nums; }
    .desc { font-size:${Math.round(s.fontSize * 0.8)}px; opacity:.85; font-style:italic; }
    .small { font-size:${Math.round(s.fontSize * 0.6)}px; opacity:.9; }
    .pr { white-space:nowrap; }
  </style></head><body><div class="stage"><div class="menu">
    <h1>${esc(spec.restaurant)}</h1>
    ${spec.note ? `<div class="note">${esc(spec.note)}</div>` : ""}
    <div class="cols">${sections}</div>
  </div></div></body></html>`;
}

const browser = await chromium.launch();
mkdirSync(outDir, { recursive: true });
for (const spec of menus) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  await page.setContent(html(spec));
  const d = spec.style.degrade;
  const jpeg = Boolean(d?.jpegQuality);
  const file = join(outDir, `${spec.id}.${jpeg ? "jpg" : "png"}`);
  await page.locator(".stage").screenshot(
    jpeg ? { path: file, type: "jpeg", quality: d?.jpegQuality } : { path: file, type: "png" },
  );
  await page.close();
  // The app downscales photos to about 1600 px on the long side; do the same.
  execFileSync("sips", ["-Z", "1600", file], { stdio: "ignore" });
  const truth = {
    id: spec.id,
    language: spec.language,
    restaurant: spec.restaurant,
    currency: spec.currency,
    degraded: Boolean(d),
    image: `${spec.id}.${jpeg ? "jpg" : "png"}`,
    dishes: spec.sections.flatMap((s) => s.items).map((i) => ({
      name: i.name,
      price: i.price,
      currency: i.currency,
      group: i.group,
      category: i.category,
      allergens: i.allergens,
      keywords: i.keywords,
    })),
  };
  writeFileSync(join(outDir, `${spec.id}.json`), `${JSON.stringify(truth, null, 2)}\n`);
  console.log(spec.id, `${Math.round(statSync(file).size / 1024)} kB`);
}
await browser.close();
