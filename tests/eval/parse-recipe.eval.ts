import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AiRecipe } from "@/server/ai/schemas";
import { createAiService } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { compare, type Check, type Expected } from "./compare";
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

// `pnpm eval:ai`: the AI port against the configured AI_PROVIDER, with the test
// set in tests/fixtures/ai/. Each case runs as text (with JSON-LD when the case
// has it), and image cases also as an image. The result is compared with
// <name>.expected.json and written to tests/eval/report.md (ignored by git).
// Refuses to run against the mock.
//
// Story 12.1: each case runs EVAL_RUNS times (default 3), and each call is
// timed the shared way (timing.ts) as "import text <name>" or "import bild
// <name>", with the tokens in and out, under EVAL_LABEL, in
// tests/eval/reports/. The koket-* and tasteline-* cases are the saved pages in
// tests/fixtures/sites/ as the import of a link reads them.

type Manifest = { default: string; cases: { name: string; jsonLd?: boolean; image?: boolean }[] };
type CaseResult = {
  name: string;
  run: number;
  input: "text" | "bild";
  seconds: number;
  error?: string;
  checks: Check[];
  recipe?: AiRecipe;
};

const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const reportPath = join(process.cwd(), "tests", "eval", "report.md");
const manifest = JSON.parse(readFileSync(join(fixtures, "manifest.json"), "utf8")) as Manifest;
const env = parseEnv(process.env);
if (env.AI_PROVIDER === "mock") {
  throw new Error(
    "pnpm eval:ai needs a real model: set AI_PROVIDER to lmstudio, anthropic or openai (the mock only repeats its fixtures).",
  );
}
const service = createAiService(env);
const results: CaseResult[] = [];
const runCount = evalRuns();
const meter = installUsageMeter();
const timings: TimingRow[] = [];

const runs = manifest.cases.flatMap(({ name, jsonLd, image }) =>
  [
    { name, jsonLd: Boolean(jsonLd), input: "text" as const },
    ...(image ? [{ name, jsonLd: false, input: "bild" as const }] : []),
  ].flatMap((entry) => Array.from({ length: runCount }, (_, index) => ({ ...entry, run: index + 1 }))),
);

describe(`parseRecipe mot ${env.AI_PROVIDER}`, () => {
  it.each(runs)("$name ($input), körning $run", async ({ name, jsonLd, input, run }) => {
    const expected = JSON.parse(readFileSync(join(fixtures, `${name}.expected.json`), "utf8")) as Expected;
    const parseInput =
      input === "text"
        ? {
            text: readFileSync(join(fixtures, `${name}.txt`), "utf8"),
            jsonLd: jsonLd ? readFileSync(join(fixtures, `${name}.jsonld.json`), "utf8") : undefined,
          }
        : { image: { data: new Uint8Array(readFileSync(join(fixtures, `${name}.png`))), mediaType: "image/png" } };

    const state = machineState(env.AI_MODEL);
    const startedAt = new Date();
    const measured = await meter.measure(() => service.parseRecipe(parseInput, AbortSignal.timeout(120_000)));
    const { value: result, seconds } = measured;

    const entry: CaseResult = result.ok
      ? { name, run, input, seconds, checks: compare(result.data, expected), recipe: result.data }
      : { name, run, input, seconds, error: result.error.code, checks: [] };
    results.push(entry);
    const valid = !entry.error && entry.checks.every((check) => check.ok);
    timings.push(timingRow(`import ${input} ${name}`, run, state, measured, valid, startedAt));

    expect(entry.error).toBeUndefined();
    expect(entry.checks.filter((check) => !check.ok)).toEqual([]);
  });
});

afterAll(() => {
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
  writeTimingReport(
    "import",
    [
      `Leverantör: ${env.AI_PROVIDER}`,
      `Modell: ${env.AI_MODEL ?? "–"}`,
      `LM Studio: ${lmStudioSettings(env.AI_MODEL)}`,
      `Läge: ${evalLabel()}`,
      `Körningar per fall: ${runCount}`,
    ],
    timings,
  );
});

function renderReport(): string {
  const passed = results.filter((result) => !result.error && result.checks.every((check) => check.ok));
  const lines = [
    "# AI-utvärdering: parseRecipe",
    "",
    `- Tid: ${new Date().toISOString()}`,
    `- Leverantör: ${env.AI_PROVIDER}`,
    `- Modell: ${env.AI_MODEL ?? "–"}`,
    `- Resultat: ${passed.length} av ${results.length} fall godkända`,
    "",
    "| Fall | Indata | Körning | Resultat | Tid (s) | Avvikelser |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map((result) => {
      const failed = result.checks.filter((check) => !check.ok);
      const status = result.error ? `Fel: ${result.error}` : failed.length === 0 ? "Godkänt" : "Avvikelser";
      const notes = failed.map((check) => `${check.name}: ${check.actual}`).join("; ") || "–";
      return `| ${result.name} | ${result.input} | ${result.run} | ${status} | ${result.seconds.toFixed(1)} | ${escapeCell(notes)} |`;
    }),
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.name} (${result.input}), körning ${result.run}`, "");
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
    lines.push("", "<details><summary>Svar</summary>", "", "```json", JSON.stringify(result.recipe, null, 2), "```", "", "</details>", "");
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
