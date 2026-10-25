import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AiRecipe } from "@/server/ai/schemas";
import { createAiService } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { compare, type Check, type Expected } from "./compare";

// `pnpm eval:ai`: the AI port against the configured AI_PROVIDER, with the test
// set in tests/fixtures/ai/. Each case runs as text (with JSON-LD when the case
// has it), and image cases also as an image. The result is compared with
// <name>.expected.json and written to tests/eval/report.md (ignored by git).
// Refuses to run against the mock.

type Manifest = { default: string; cases: { name: string; jsonLd?: boolean; image?: boolean }[] };
type CaseResult = {
  name: string;
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

const runs = manifest.cases.flatMap(({ name, jsonLd, image }) => [
  { name, jsonLd: Boolean(jsonLd), input: "text" as const },
  ...(image ? [{ name, jsonLd: false, input: "bild" as const }] : []),
]);

describe(`parseRecipe mot ${env.AI_PROVIDER}`, () => {
  it.each(runs)("$name ($input)", async ({ name, jsonLd, input }) => {
    const expected = JSON.parse(readFileSync(join(fixtures, `${name}.expected.json`), "utf8")) as Expected;
    const parseInput =
      input === "text"
        ? {
            text: readFileSync(join(fixtures, `${name}.txt`), "utf8"),
            jsonLd: jsonLd ? readFileSync(join(fixtures, `${name}.jsonld.json`), "utf8") : undefined,
          }
        : { image: { data: new Uint8Array(readFileSync(join(fixtures, `${name}.png`))), mediaType: "image/png" } };

    const started = performance.now();
    const result = await service.parseRecipe(parseInput, AbortSignal.timeout(120_000));
    const seconds = (performance.now() - started) / 1000;

    const entry: CaseResult = result.ok
      ? { name, input, seconds, checks: compare(result.data, expected), recipe: result.data }
      : { name, input, seconds, error: result.error.code, checks: [] };
    results.push(entry);

    expect(entry.error).toBeUndefined();
    expect(entry.checks.filter((check) => !check.ok)).toEqual([]);
  });
});

afterAll(() => {
  writeFileSync(reportPath, renderReport());
  console.log(`Wrote ${reportPath}`);
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
    "| Fall | Indata | Resultat | Tid (s) | Avvikelser |",
    "| --- | --- | --- | --- | --- |",
    ...results.map((result) => {
      const failed = result.checks.filter((check) => !check.ok);
      const status = result.error ? `Fel: ${result.error}` : failed.length === 0 ? "Godkänt" : "Avvikelser";
      const notes = failed.map((check) => `${check.name}: ${check.actual}`).join("; ") || "–";
      return `| ${result.name} | ${result.input} | ${status} | ${result.seconds.toFixed(1)} | ${escapeCell(notes)} |`;
    }),
    "",
  ];

  for (const result of results) {
    lines.push(`## ${result.name} (${result.input})`, "");
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
