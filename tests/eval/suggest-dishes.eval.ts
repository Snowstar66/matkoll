import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AiRecipe } from "@/server/ai/schemas";
import { createAiService, type SuggestDishesInput } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { normalize, type Check } from "./compare";
import { answerShape, checkSuggestions, type AnswerShape, type SuggestExpected } from "./suggest-checks";
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

// `pnpm eval:ai`: suggestDishes against the configured AI_PROVIDER with the
// pantry in tests/fixtures/ai/suggest-dishes.pantry.json, first as it is and
// then with the first answer's titles to avoid ("Föreslå andra rätter"). Each
// answer is checked against suggest-dishes.expected.json (three suggestions,
// titles of their own, at least three lines from the pantry each) and the
// time is written to tests/eval/suggest-report.md (ignored by git). Refuses to
// run against the mock.
//
// Story 12.1: the pair runs EVAL_RUNS times (default 3), and each call is
// timed the shared way (timing.ts) as "förslag" and "andra rätter", with the
// tokens in and out, under EVAL_LABEL, in tests/eval/reports/.
//
// Story 12.3: suggest-report.md also has the tokens out per call, the lines
// from the pantry per suggestion, and the shape of the model's last answer
// text (answerShape): compact or full, indented or on one line, and the
// lines without `new` whose name is not in the pantry.

type RunResult = {
  name: string;
  run: number;
  seconds: number;
  error?: string;
  checks: Check[];
  recipes?: AiRecipe[];
  /** Story 12.3: tokens out over all attempts, and the shape of the last answer text. */
  outputTokens: number | null;
  calls: number;
  shape: AnswerShape | null;
};

const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const reportPath = join(process.cwd(), "tests", "eval", "suggest-report.md");
const manifest = JSON.parse(readFileSync(join(fixtures, "manifest.json"), "utf8")) as { suggest: string };
const input = JSON.parse(readFileSync(join(fixtures, `${manifest.suggest}.pantry.json`), "utf8")) as SuggestDishesInput;
const expected = JSON.parse(readFileSync(join(fixtures, `${manifest.suggest}.expected.json`), "utf8")) as SuggestExpected;
const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") {
  throw new Error(
    "pnpm eval:ai needs a real model: set AI_PROVIDER to lmstudio, anthropic or openai (the mock only repeats its fixtures).",
  );
}
const service = createAiService(env);
const results: RunResult[] = [];
const runs = evalRuns();
const meter = installUsageMeter();
const timings: TimingRow[] = [];
/** The flow's name in the timing report, per call name here. */
const flows: Record<string, string> = { lagret: "förslag", "andra rätter": "andra rätter" };

async function run(name: string, runNumber: number, runInput: SuggestDishesInput): Promise<RunResult> {
  const state = machineState(env.AI_MODEL);
  const startedAt = new Date();
  const measured = await meter.measure(() => service.suggestDishes(runInput, AbortSignal.timeout(120_000)));
  const { value: result, seconds } = measured;
  const measuredParts = {
    outputTokens: measured.usage.outputTokens,
    calls: measured.usage.calls,
    shape: answerShape(measured.contents.at(-1), runInput),
  };
  const entry: RunResult = result.ok
    ? { name, run: runNumber, seconds, checks: checkSuggestions(result.data, runInput, expected), recipes: result.data, ...measuredParts }
    : { name, run: runNumber, seconds, error: result.error.code, checks: [], ...measuredParts };
  results.push(entry);
  const valid = !entry.error && entry.checks.every((check) => check.ok);
  timings.push(timingRow(flows[name] ?? name, runNumber, state, measured, valid, startedAt));
  return entry;
}

describe(`suggestDishes mot ${env.AI_PROVIDER}`, () => {
  for (let runNumber = 1; runNumber <= runs; runNumber++) {
    // In order: the second call avoids the first one's titles.
    let firstTitles: string[] = [];

    it(`förslag ur lagret, körning ${runNumber}`, async () => {
      const first = await run("lagret", runNumber, input);
      firstTitles = (first.recipes ?? []).map((recipe) => recipe.title);
      expect(first.error).toBeUndefined();
      expect(first.checks.filter((check) => !check.ok)).toEqual([]);
    });

    it(`andra rätter, körning ${runNumber}`, async () => {
      const second = await run("andra rätter", runNumber, { ...input, avoidTitles: firstTitles });
      expect(second.error).toBeUndefined();
      expect(second.checks.filter((check) => !check.ok)).toEqual([]);
    });
  }
});

afterAll(() => {
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
  writeTimingReport(
    "förslag",
    [
      `Leverantör: ${env.AI_PROVIDER}`,
      `Modell: ${env.AI_MODEL ?? "–"}`,
      `LM Studio: ${lmStudioSettings(env.AI_MODEL)}`,
      `Läge: ${evalLabel()}`,
      `Lager: ${input.pantry.length} rader`,
      `Körningar: ${runs}`,
    ],
    timings,
  );
});

function renderReport(): string {
  const passed = results.filter((result) => !result.error && result.checks.every((check) => check.ok));
  const lines = [
    "# AI-utvärdering: suggestDishes",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Lager: ${input.pantry.length} rader (${manifest.suggest}.pantry.json)`,
    `- Resultat: ${passed.length} av ${results.length} anrop godkända`,
    "",
    "| Anrop | Körning | Resultat | Tid (s) | Token ut | Anrop till modellen | Rader ur lagret per förslag | Format | Titlar |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...results.map((result) => {
      const failed = result.checks.filter((check) => !check.ok);
      const status = result.error ? `Fel: ${result.error}` : failed.length === 0 ? "Godkänt" : "Avvikelser";
      const titles = (result.recipes ?? []).map((recipe) => recipe.title).join(" / ") || "–";
      return `| ${result.name} | ${result.run} | ${status} | ${result.seconds.toFixed(1)} | ${result.outputTokens ?? "–"} | ${result.calls} | ${pantryLinesPerDish(result)} | ${escapeCell(shapeText(result.shape))} | ${escapeCell(titles)} |`;
    }),
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.name}, körning ${result.run}`, "");
    if (result.error) {
      lines.push(`Felkod: \`${result.error}\``, "");
      continue;
    }
    lines.push("| Kontroll | Förväntat | Fick | OK |", "| --- | --- | --- | --- |");
    for (const check of result.checks) {
      lines.push(
        `| ${escapeCell(check.name)} | ${escapeCell(check.expected)} | ${escapeCell(check.actual)} | ${check.ok ? "ja" : "nej"} |`,
      );
    }
    lines.push("", "<details><summary>Svar</summary>", "", "```json", JSON.stringify(result.recipes, null, 2), "```", "", "</details>", "");
  }
  return `${lines.join("\n")}\n`;
}

/** Lines whose hint.name is a pantry item's name, per dish, as "6 / 5 / 7"; "–" without an answer. */
function pantryLinesPerDish(result: RunResult): string {
  if (!result.recipes) return "–";
  const pantry = new Set(input.pantry.map((item) => normalize(item.name)));
  return result.recipes
    .map((recipe) => `${recipe.ingredients.filter((line) => pantry.has(normalize(line.hint.name))).length} av ${recipe.ingredients.length}`)
    .join(" / ");
}

/** Story 12.3: compact or full, indented or not, and lines without `new` that do not match the pantry. */
function shapeText(shape: AnswerShape | null): string {
  if (!shape) return "–";
  const parts = [shape.compact ? "kompakt" : "fullt", shape.indented ? "indraget" : "på en rad"];
  if (shape.compact) {
    parts.push(`${shape.linesWithNew} av ${shape.lines} rader med new`);
    parts.push(
      shape.unmatchedWithoutNew.length === 0
        ? "alla rader utan new i lagret"
        : `utan new och inte i lagret: ${shape.unmatchedWithoutNew.join(", ")}`,
    );
  }
  return parts.join(", ");
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
