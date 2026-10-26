import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { maxPantrySuggestions } from "@/features/pantry/domain/pantry-suggestion";
import { readingLabel } from "@/features/pantry/domain/photo-numbers";
import { imageSizeOf, imageTypeOf, maxImageBytes, maxPlacePhotoSide, stripJpegMetadata, stripPngMetadata } from "@/lib/images";
import { minLoopRepeats, type AiPantryItem } from "@/server/ai/schemas";
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
// Story 6.6: after each reading with items, the run also asks locateItems
// for the points of the items on the same photo, as the app does after the
// cards are shown: the first 25 items, as one-line labels (readingLabel).
// The report gives the time of the reading, the time of the points and their
// sum, and how many items got a point. A failed lookup fails the run; a
// missing point does not. Refuses to run
// against the mock. Photos of a home only go to a model on this computer (LM
// Studio on localhost); another provider needs EVAL_ALLOW_REMOTE_PHOTOS=1.
// With no photos it says so and skips. Nothing of the photo is printed.

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
  items?: AiPantryItem[];
  /** Story 6.6: the lookup of the points after the reading, when it had items. */
  locate?: { seconds: number; error?: string; located?: number; labels: number; invalid?: number };
};

/** How many times each photo is sent: EVAL_RUNS, default 3 (Story 6.5), so the report shows whether the runs agree. */
const runs = Math.max(1, Number.parseInt(process.env.EVAL_RUNS ?? "3", 10) || 3);
/** The AI port's attempt budget (AD-9): a run that takes longer would fail in the app. */
const maxRunSeconds = 100;
const isLoop = (result: CaseResult) => (result.repeated ?? 0) >= minLoopRepeats;

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
  const fits = size !== null && bytes.byteLength <= maxImageBytes && Math.max(size.width, size.height) <= maxPlacePhotoSide;
  if (fits && type === "image/jpeg") {
    const stripped = stripJpegMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (fits && type === "image/png") {
    const stripped = stripPngMetadata(bytes);
    if (stripped) return { data: stripped, mediaType: type };
  }
  if (process.platform !== "darwin") return { error: "convert it to a JPEG or PNG of at most 2048 px and 1.5 MB" };
  const temporary = mkdtempSync(join(tmpdir(), "matkoll-eval-"));
  try {
    const out = join(temporary, "photo.jpg");
    // Made smaller only when its longest side is over 2048 px (sips -Z would also make a small photo larger).
    const longest = size ? Math.max(size.width, size.height) : sipsLongestSide(path);
    const resize = longest === null || longest > maxPlacePhotoSide ? ["-Z", String(maxPlacePhotoSide)] : [];
    execFileSync("sips", [...resize, "-s", "format", "jpeg", "-s", "formatOptions", "85", path, "--out", out], {
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

/** The longest side of a photo imageSizeOf cannot read (HEIC), from sips; `null` when sips cannot tell. */
function sipsLongestSide(path: string): number | null {
  try {
    const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
    const sides = [...output.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map((match) => Number(match[1]));
    return sides.length === 2 ? Math.max(...sides) : null;
  } catch {
    return null;
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
    const photo = preparePhoto(file);
    let entry: CaseResult;
    if ("error" in photo) {
      entry = { name, file, run, place: expected.place, seconds: 0, error: photo.error, hits: [], misses: expected.items, wrong: [] };
    } else {
      const started = performance.now();
      const result = await service.analyzeImage({ image: photo, place: expected.place }, AbortSignal.timeout(120_000));
      const seconds = (performance.now() - started) / 1000;
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
      if (result.ok && result.data.items.length > 0) entry.locate = await locate(photo, result.data.items);
    }
    results.push(entry);
    expect(entry.error).toBeUndefined();
    expect(entry.locate?.error).toBeUndefined();
    expect(isLoop(entry)).toBe(false);
    expect(entry.seconds).toBeLessThanOrEqual(maxRunSeconds);
  });
});

/** Story 6.6: the points of the items on the photo, timed, as the app asks for them after the reading. */
async function locate(photo: { data: Uint8Array; mediaType: string }, items: AiPantryItem[]): Promise<NonNullable<CaseResult["locate"]>> {
  const labels = items.slice(0, maxPantrySuggestions).map((item) => readingLabel(item.label));
  const started = performance.now();
  const result = await service.locateItems({ image: photo, labels }, AbortSignal.timeout(60_000));
  const seconds = (performance.now() - started) / 1000;
  return result.ok
    ? { seconds, labels: labels.length, located: result.data.positions.length, invalid: result.data.invalid }
    : { seconds, labels: labels.length, error: result.error.code };
}

afterAll(() => {
  if (results.length === 0) return;
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
});

function renderReport(): string {
  const timed = results.filter((result) => !result.error);
  const slowest = timed.length > 0 ? Math.max(...timed.map((result) => result.seconds)) : 0;
  const locatedRuns = results.filter((result) => result.locate && !result.locate.error);
  const slowestLocate = locatedRuns.length > 0 ? Math.max(...locatedRuns.map((result) => result.locate!.seconds)) : 0;
  const hits = results.reduce((sum, result) => sum + result.hits.length, 0);
  const expected = results.reduce((sum, result) => sum + result.hits.length + result.misses.length, 0);
  const lines = [
    "# AI-utvärdering: analyzeImage",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Körningar per foto: ${runs}`,
    `- Körningar: ${results.length}, varav ${results.filter((result) => result.error).length} med fel och ${results.filter(isLoop).length} med upprepningsslinga`,
    `- Träffar: ${hits} av ${expected} förväntade varor`,
    `- Längsta tid: ${slowest.toFixed(1)} s${slowest > maxRunSeconds ? ` (över ${maxRunSeconds} s: lägg frågan i docs/oppna-fragor.md)` : ""}`,
    `- Punkter på fotot (Story 6.6): ${locatedRuns.length} av ${results.filter((result) => result.locate).length} uppslag lyckades, längsta ${slowestLocate.toFixed(1)} s`,
    "",
    "| Foto | Körning | Plats | Tid (s) | Punkter (s) | Summa (s) | Punkter | Varor | Osäkra | Ogiltiga | Upprepningar | Slinga | Träffar | Missar | Felgissningar |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) =>
      [
        result.name,
        String(result.run),
        result.place,
        result.error ? `Fel: ${result.error}` : result.seconds.toFixed(1),
        ...locateCells(result),
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
      "| Som den syns | Grundform | Säkerhet | Mängd | Enhet |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const item of result.items ?? []) {
      lines.push(
        `| ${escapeCell(item.label)} | ${escapeCell(item.hint.name)} | ${item.confidence} | ${item.amount ?? "–"} | ${escapeCell(item.unit ?? "–")} |`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** Story 6.6: the lookup's time, the sum with the reading, and how many items got a point ("alla" when every one did). */
function locateCells(result: CaseResult): string[] {
  const { locate: located } = result;
  if (!located) return ["–", "–", "–"];
  if (located.error) return [`Fel: ${located.error}`, "–", "–"];
  const count = located.located ?? 0;
  const points = count === located.labels ? `alla ${count}` : `${count} av ${located.labels}`;
  const invalid = located.invalid ? `, ${located.invalid} ogiltiga` : "";
  return [located.seconds.toFixed(1), (result.seconds + located.seconds).toFixed(1), `${points}${invalid}`];
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
