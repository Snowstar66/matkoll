import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AiRecipe } from "@/server/ai/schemas";
import { createAiService, type SuggestDishesInput } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import type { Check } from "./compare";
import { checkSuggestions, type SuggestExpected } from "./suggest-checks";
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

type RunResult = { name: string; run: number; seconds: number; error?: string; checks: Check[]; recipes?: AiRecipe[] };

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
  const entry: RunResult = result.ok
    ? { name, run: runNumber, seconds, checks: checkSuggestions(result.data, runInput, expected), recipes: result.data }
    : { name, run: runNumber, seconds, error: result.error.code, checks: [] };
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
    "| Anrop | Körning | Resultat | Tid (s) | Titlar |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((result) => {
      const failed = result.checks.filter((check) => !check.ok);
      const status = result.error ? `Fel: ${result.error}` : failed.length === 0 ? "Godkänt" : "Avvikelser";
      const titles = (result.recipes ?? []).map((recipe) => recipe.title).join(" / ") || "–";
      return `| ${result.name} | ${result.run} | ${status} | ${result.seconds.toFixed(1)} | ${escapeCell(titles)} |`;
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

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
