import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { imageSizeOf, imageTypeOf, maxImageBytes, maxImageSide, stripJpegMetadata, stripPngMetadata } from "@/lib/images";
import type { AiPantryItem } from "@/server/ai/schemas";
import { analyzePlaces, createAiService, type AnalyzePlace } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";

// `pnpm eval:ai`: analyzeImage against the configured AI_PROVIDER with
// Pontus's own photos of the fridge, the freezer and the pantry in
// tests/eval/photos/, which git ignores (the repo is public, so real photos
// of a home never go in it). Each photo is <name>.jpg (or .jpeg, .png, .webp,
// and on a Mac .heic) with <name>.expected.json beside it:
//
//   { "place": "Kyl", "items": ["mjölk", "smör", "ägg"] }
//
// with the items that can be seen, in base form. Every photo is sent without
// its metadata, like the client sends it: a JPEG or PNG that fits has its
// metadata segments or chunks removed (stripJpegMetadata, stripPngMetadata),
// and any other photo (too large, WebP, HEIC) is made small with macOS's
// sips into a temporary folder that is removed afterwards, and then stripped.
// For each photo the report tests/eval/analyze-report.md (ignored by git)
// lists the hits (expected items the model named), the misses, the wrong
// guesses (items it named that were not expected), the items the port left
// out as invalid and the time. Refuses to run against the mock. Photos of a
// home only go to a model on this computer (LM Studio on localhost); another
// provider needs EVAL_ALLOW_REMOTE_PHOTOS=1. With no photos it says so and
// skips.

type Expected = { place: AnalyzePlace; items: string[] };
type CaseResult = {
  name: string;
  place: AnalyzePlace;
  seconds: number;
  error?: string;
  hits: string[];
  misses: string[];
  wrong: string[];
  invalid?: number;
  items?: AiPantryItem[];
};

const photosDir = join(process.cwd(), "tests", "eval", "photos");
const reportPath = join(process.cwd(), "tests", "eval", "analyze-report.md");
const photoTypes = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);

const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") {
  throw new Error(
    "pnpm eval:ai needs a real model: set AI_PROVIDER to lmstudio, anthropic or openai (the mock only repeats its fixtures).",
  );
}
const service = createAiService(env);
const results: CaseResult[] = [];

/** The photos stay on this computer unless Pontus opts in: LM Studio on localhost, or EVAL_ALLOW_REMOTE_PHOTOS=1. */
function remoteRefusal(): string | null {
  if (process.env.EVAL_ALLOW_REMOTE_PHOTOS === "1") return null;
  if (env.AI_PROVIDER === "lmstudio" && env.LMSTUDIO_BASE_URL) {
    const host = new URL(env.LMSTUDIO_BASE_URL).hostname;
    if (["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) return null;
  }
  return `skickar inte egna foton till ${env.AI_PROVIDER} utanför den här datorn; sätt EVAL_ALLOW_REMOTE_PHOTOS=1 för att tillåta det`;
}

/** The photos that have an expected.json, sorted by name. */
function photoCases(): { name: string; file: string }[] {
  if (!existsSync(photosDir)) return [];
  return readdirSync(photosDir)
    .filter((file) => photoTypes.has(extname(file).toLowerCase()))
    .map((file) => ({ name: file.slice(0, -extname(file).length), file }))
    .filter(({ name }) => existsSync(join(photosDir, `${name}.expected.json`)))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/** The photo as the client would send it, without metadata: stripped when it fits, else made small with sips (macOS) and stripped. */
function preparePhoto(file: string): { data: Uint8Array; mediaType: string } | { error: string } {
  const path = join(photosDir, file);
  const bytes = new Uint8Array(readFileSync(path));
  const type = imageTypeOf(bytes);
  const size = imageSizeOf(bytes);
  const fits = size !== null && bytes.byteLength <= maxImageBytes && Math.max(size.width, size.height) <= maxImageSide;
  if (fits && type === "image/jpeg") {
    const stripped = stripJpegMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (fits && type === "image/png") {
    const stripped = stripPngMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (process.platform !== "darwin") return { error: "convert it to a JPEG or PNG of at most 1600 px and 1.5 MB" };
  const temporary = mkdtempSync(join(tmpdir(), "matkoll-eval-"));
  try {
    const out = join(temporary, "photo.jpg");
    execFileSync("sips", ["-Z", String(maxImageSide), "-s", "format", "jpeg", "-s", "formatOptions", "80", path, "--out", out], {
      stdio: "ignore",
    });
    const resized = stripJpegMetadata(new Uint8Array(readFileSync(out)));
    if (!resized || resized.byteLength > maxImageBytes) return { error: "too_large after sips" };
    return { data: resized, mediaType: "image/jpeg" };
  } catch {
    return { error: "unreadable (sips could not convert it)" };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** An expected item is named when an item's hint name is it, or its label has it as a whole word (both normalised). */
function names(item: AiPantryItem, expected: string): boolean {
  const wanted = normalizeIngredientText(expected);
  if (!wanted) return false;
  if (normalizeIngredientText(item.hint.name) === wanted) return true;
  return ` ${normalizeIngredientText(item.label)} `.includes(` ${wanted} `);
}

function compare(items: AiPantryItem[], expected: string[]) {
  const hits = expected.filter((wanted) => items.some((item) => names(item, wanted)));
  const misses = expected.filter((wanted) => !hits.includes(wanted));
  const wrong = items.filter((item) => !expected.some((wanted) => names(item, wanted))).map((item) => item.hint.name);
  return { hits, misses, wrong };
}

const cases = photoCases();

describe(`analyzeImage mot ${env.AI_PROVIDER}`, () => {
  if (cases.length === 0) {
    it.skip(`inga foton med <namn>.expected.json i ${photosDir}; lägg dit egna foton för att utvärdera bildanalysen`, () => {});
    return;
  }
  const refusal = remoteRefusal();
  if (refusal) {
    it.skip(refusal, () => {});
    return;
  }

  it.each(cases)("$name", async ({ name, file }) => {
    const expected = JSON.parse(readFileSync(join(photosDir, `${name}.expected.json`), "utf8")) as Expected;
    if (!(analyzePlaces as readonly string[]).includes(expected.place)) throw new Error(`${name}: place must be Kyl, Frys or Skafferi`);
    const photo = preparePhoto(file);
    let entry: CaseResult;
    if ("error" in photo) {
      entry = { name, place: expected.place, seconds: 0, error: photo.error, hits: [], misses: expected.items, wrong: [] };
    } else {
      const started = performance.now();
      const result = await service.analyzeImage({ image: photo, place: expected.place }, AbortSignal.timeout(120_000));
      const seconds = (performance.now() - started) / 1000;
      entry = result.ok
        ? {
            name,
            place: expected.place,
            seconds,
            ...compare(result.data.items, expected.items),
            invalid: result.data.invalid,
            items: result.data.items,
          }
        : { name, place: expected.place, seconds, error: result.error.code, hits: [], misses: expected.items, wrong: [] };
    }
    results.push(entry);
    expect(entry.error).toBeUndefined();
  });
});

afterAll(() => {
  if (results.length === 0) return;
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
});

function renderReport(): string {
  const timed = results.filter((result) => !result.error);
  const slowest = timed.length > 0 ? Math.max(...timed.map((result) => result.seconds)) : 0;
  const hits = results.reduce((sum, result) => sum + result.hits.length, 0);
  const expected = results.reduce((sum, result) => sum + result.hits.length + result.misses.length, 0);
  const lines = [
    "# AI-utvärdering: analyzeImage",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Foton: ${results.length}, varav ${results.filter((result) => result.error).length} med fel`,
    `- Träffar: ${hits} av ${expected} förväntade varor`,
    `- Längsta tid: ${slowest.toFixed(1)} s${slowest > 90 ? " (över 90 s: lägg frågan i docs/oppna-fragor.md)" : ""}`,
    "",
    "| Foto | Plats | Tid (s) | Träffar | Missar | Felgissningar | Ogiltiga |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) =>
      [
        result.name,
        result.place,
        result.error ? `Fel: ${result.error}` : result.seconds.toFixed(1),
        result.hits.join(", ") || "–",
        result.misses.join(", ") || "–",
        result.wrong.join(", ") || "–",
        String(result.invalid ?? "–"),
      ]
        .map(escapeCell)
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    ),
    "",
  ];
  for (const result of results.filter((entry) => entry.items)) {
    lines.push(`## ${result.name}`, "", "| Som den syns | Grundform | Mängd | Enhet |", "| --- | --- | --- | --- |");
    for (const item of result.items ?? []) {
      lines.push(`| ${escapeCell(item.label)} | ${escapeCell(item.hint.name)} | ${item.amount ?? "–"} | ${escapeCell(item.unit ?? "–")} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
