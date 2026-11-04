import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { maxPantrySuggestions } from "@/features/pantry/domain/pantry-suggestion";
import { placePhotoSizeFor, type PlacePhotoSize } from "@/lib/images";
import { minLoopRepeats, type AiPantryItem, type PhotoItem } from "@/server/ai/schemas";
import { analyzePlaces, createAiService, type AnalyzePlace } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { photoTypes, preparePhoto } from "./photos";
import {
  evalLabel,
  evalRuns,
  installUsageMeter,
  lmStudioSettings,
  machineState,
  timingRow,
  writeTimingReport,
  type TimingRow,
} from "./timing";

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
// sips to at most 2048 px at quality 85, as the client makes a photo of a
// place (Story 6.5), into a temporary folder that is removed afterwards, and
// then stripped. Each photo is sent EVAL_RUNS times (default 3, Story 6.5),
// one run after the other. For each run the report tests/eval/analyze-report.md
// (ignored by git) lists the time, the items, the unsure ones, the ones the
// port left out as invalid, the repeats it merged, whether that was a loop,
// the hits (expected items the model named), the misses and the wrong guesses
// (items it named that were not expected). A run fails on an error, a loop
// (one label minLoopRepeats extra times or more) or more than maxRunSeconds. For
// each photo the report also says whether its runs gave the same item names
// (the lowest pairwise Jaccard when not), which never fails a run: at
// temperature 0 they should agree (2026-10-26).
//
// Kylfoto B: the points of the items on the photo come in the same answer
// (no second call), so the report says how many of the kept items (the first
// 25) got a point, and how long the answer was in characters per item
// (compact JSON, as the model writes it). A missing point never fails a run.
//
// Story 12.1: the call is also timed the shared way (timing.ts): a row
// "bildanalys <photo>" per run, with the tokens in
// and out, under EVAL_LABEL, in tests/eval/reports/. Refuses to run
// against the mock. Photos of a home only go to a model on this computer (LM
// Studio on localhost); another provider needs EVAL_ALLOW_REMOTE_PHOTOS=1.
// With no photos it says so and skips. Nothing of the photo is printed.
//
// Kylfoto A: without EVAL_PHOTO_READING (or with `before`) each photo is read
// as the app does: 2048 px at quality 85, and the level from Inställningar with
// thinking on. The app went back to that on 2026-11-04, when Pontus found the
// fast mode read worse. EVAL_PHOTO_READING=after measures that fast mode
// instead (for Claude: 1600 px at 80, effort low, and thinking off on Haiku
// 5.5). Run both with an EVAL_LABEL each to compare the time and the hits. A
// model that cannot point at things (Claude) gets no lookup of the points, as
// in the app.

type Expected = { place: AnalyzePlace; items: string[] };
type CaseResult = {
  name: string;
  /** The photo's file name, with its extension: two photos may share a name. */
  file: string;
  run: number;
  place: AnalyzePlace;
  seconds: number;
  error?: string;
  hits: string[];
  misses: string[];
  wrong: string[];
  invalid?: number;
  repeated?: number;
  items?: PhotoItem[];
};

/** How many times each photo is sent: EVAL_RUNS, default 3 (Story 6.5), so the report shows whether the runs agree. */
const runs = evalRuns();
/** The AI port's attempt budget (AD-9): a run that takes longer would fail in the app. */
const maxRunSeconds = 100;
const isLoop = (result: CaseResult) => (result.repeated ?? 0) >= minLoopRepeats;

const photosDir = join(process.cwd(), "tests", "eval", "photos");
const reportPath = join(process.cwd(), "tests", "eval", "analyze-report.md");

const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") {
  throw new Error(
    "pnpm eval:ai needs a real model: set AI_PROVIDER to lmstudio, anthropic or openai (the mock only repeats its fixtures).",
  );
}
/** Kylfoto A: `after` reads the photo in the fast mode, otherwise as the app does now. */
const photoReading = process.env.EVAL_PHOTO_READING === "after" ? "after" : "before";
/** The fast mode's photo for Claude (Kylfoto A, 2026-11-02 to 2026-11-04). */
const fastClaudePhoto: PlacePhotoSize = { maxSide: 1600, quality: 0.8 };
const photoSize =
  photoReading === "after" && env.AI_PROVIDER === "anthropic" ? fastClaudePhoto : placePhotoSizeFor(env.AI_PROVIDER);
const service = createAiService(env, { fastPhotoReading: photoReading === "after" });
const results: CaseResult[] = [];
const meter = installUsageMeter();
const timings: TimingRow[] = [];

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

const cases = photoCases().flatMap((photo) => Array.from({ length: runs }, (_, index) => ({ ...photo, run: index + 1 })));

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

  it.each(cases)("$name, körning $run", async ({ name, file, run }) => {
    const expected = JSON.parse(readFileSync(join(photosDir, `${name}.expected.json`), "utf8")) as Expected;
    if (!(analyzePlaces as readonly string[]).includes(expected.place)) throw new Error(`${name}: place must be Kyl, Frys or Skafferi`);
    const photo = preparePhoto(join(photosDir, file), photoSize);
    let entry: CaseResult;
    if ("error" in photo) {
      entry = { name, file, run, place: expected.place, seconds: 0, error: photo.error, hits: [], misses: expected.items, wrong: [] };
    } else {
      const state = machineState(env.AI_MODEL);
      const startedAt = new Date();
      const measured = await meter.measure(() =>
        service.analyzeImage({ image: photo, place: expected.place }, AbortSignal.timeout(120_000)),
      );
      const { value: result, seconds } = measured;
      entry = result.ok
        ? {
            name,
            file,
            run,
            place: expected.place,
            seconds,
            ...compare(result.data.items, expected.items),
            invalid: result.data.invalid,
            repeated: result.data.repeated,
            items: result.data.items,
          }
        : { name, file, run, place: expected.place, seconds, error: result.error.code, hits: [], misses: expected.items, wrong: [] };
      timings.push(
        timingRow(
          `bildanalys ${name}`,
          run,
          state,
          measured,
          result.ok && result.data.repeated < minLoopRepeats && seconds <= maxRunSeconds,
          startedAt,
        ),
      );
    }
    results.push(entry);
    expect(entry.error).toBeUndefined();
    expect(isLoop(entry)).toBe(false);
    expect(entry.seconds).toBeLessThanOrEqual(maxRunSeconds);
  });
});

afterAll(() => {
  if (results.length === 0) return;
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
  writeTimingReport(
    "bildanalys",
    [
      `Leverantör: ${env.AI_PROVIDER}`,
      `Modell: ${env.AI_MODEL ?? "–"}`,
      `LM Studio: ${lmStudioSettings(env.AI_MODEL)}`,
      `Läge: ${evalLabel()}`,
      `Kylfoto: ${photoReading === "after" ? "snabbläget från Kylfoto A" : "som i appen"}, ${photoSize.maxSide} px, kvalitet ${photoSize.quality}`,
      `Körningar per foto: ${runs}`,
    ],
    timings,
  );
});

function renderReport(): string {
  const timed = results.filter((result) => !result.error);
  const slowest = timed.length > 0 ? Math.max(...timed.map((result) => result.seconds)) : 0;
  const kept = results.flatMap((result) => (result.items ?? []).slice(0, maxPantrySuggestions));
  const pointed = kept.filter((item) => item.point !== null).length;
  const hits = results.reduce((sum, result) => sum + result.hits.length, 0);
  const expected = results.reduce((sum, result) => sum + result.hits.length + result.misses.length, 0);
  const lines = [
    "# AI-utvärdering: analyzeImage",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Kylfoto (Kylfoto A): ${photoReading === "after" ? "snabbläget" : "som i appen"}, ${photoSize.maxSide} px, kvalitet ${photoSize.quality}`,
    `- Körningar per foto: ${runs}`,
    `- Körningar: ${results.length}, varav ${results.filter((result) => result.error).length} med fel och ${results.filter(isLoop).length} med upprepningsslinga`,
    `- Träffar: ${hits} av ${expected} förväntade varor`,
    `- Längsta tid: ${slowest.toFixed(1)} s${slowest > maxRunSeconds ? ` (över ${maxRunSeconds} s: lägg frågan i docs/oppna-fragor.md)` : ""}`,
    `- Punkter på fotot (Kylfoto B, i samma svar): ${pointed} av ${kept.length} varor`,
    "",
    "| Foto | Körning | Plats | Tid (s) | Punkter | Tecken per vara | Varor | Osäkra | Ogiltiga | Upprepningar | Slinga | Träffar | Missar | Felgissningar |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) =>
      [
        result.name,
        String(result.run),
        result.place,
        result.error ? `Fel: ${result.error}` : result.seconds.toFixed(1),
        ...pointCells(result),
        String(result.items?.length ?? "–"),
        String(result.items?.filter((item) => item.confidence === "osäker").length ?? "–"),
        String(result.invalid ?? "–"),
        String(result.repeated ?? "–"),
        result.error ? "–" : isLoop(result) ? "ja" : "nej",
        result.hits.join(", ") || "–",
        result.misses.join(", ") || "–",
        result.wrong.join(", ") || "–",
      ]
        .map(escapeCell)
        .join(" | ")
        .replace(/^/, "| ")
        .concat(" |"),
    ),
    "",
    "## Samma varor mellan körningar",
    "",
    ...agreementLines(),
    "",
  ];
  for (const result of results.filter((entry) => entry.items)) {
    lines.push(
      `## ${result.name}, körning ${result.run}`,
      "",
      "| Som den syns | Grundform | Säkerhet | Mängd | Enhet | Punkt |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const item of result.items ?? []) {
      lines.push(
        `| ${escapeCell(item.label)} | ${escapeCell(item.hint.name)} | ${item.confidence} | ${item.amount ?? "–"} | ${escapeCell(item.unit ?? "–")} | ${item.point ? `${item.point.x}, ${item.point.y}` : "–"} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** Kylfoto B: how many kept items got a point ("alla" when every one did), and the answer's characters per item. */
function pointCells(result: CaseResult): string[] {
  if (!result.items || result.items.length === 0) return ["–", "–"];
  const kept = result.items.slice(0, maxPantrySuggestions);
  const count = kept.filter((item) => item.point !== null).length;
  return [count === kept.length ? `alla ${count}` : `${count} av ${kept.length}`, String(Math.round(answerChars(kept) / kept.length))];
}

/** The items as the model writes them in the short form, in compact JSON: an estimate of the answer's length (merged copies are not counted). */
function answerChars(items: readonly PhotoItem[]): number {
  return JSON.stringify({ i: items.map(shortForm) }).length;
}

function shortForm(item: PhotoItem) {
  const point = item.point ? [item.point.x, item.point.y] : null;
  const alternatives = item.confidence === "osäker" ? item.alternatives : null;
  return { l: item.label, n: item.hint.name, q: item.amount, u: item.unit, s: item.hint.section, p: point, a: alternatives };
}

/** The item names of a run as a set: the labels as they are seen, normalised. */
function itemNames(result: CaseResult): Set<string> {
  return new Set((result.items ?? []).map((item) => normalizeIngredientText(item.label)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 1;
  return [...a].filter((name) => b.has(name)).length / union.size;
}

/** One line per photo file: whether its runs without error gave the same item names, else the lowest pairwise Jaccard. Reported only. */
function agreementLines(): string[] {
  const files = [...new Set(results.map((result) => result.file))];
  return files.map((file) => {
    const sets = results.filter((result) => result.file === file && result.items).map(itemNames);
    if (sets.length < 2) return `- ${escapeCell(file)}: en körning, inget att jämföra`;
    let lowest = 1;
    for (let i = 0; i < sets.length; i += 1) {
      for (let j = i + 1; j < sets.length; j += 1) lowest = Math.min(lowest, jaccard(sets[i], sets[j]));
    }
    return lowest === 1
      ? `- ${escapeCell(file)}: samma varunamn i alla ${sets.length} körningar`
      : `- ${escapeCell(file)}: olika varunamn mellan körningarna (lägsta Jaccard ${lowest.toFixed(2)})`;
  });
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
