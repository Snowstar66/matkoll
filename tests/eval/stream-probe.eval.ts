import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateText, Output, streamText } from "ai";
import { describe, expect, it } from "vitest";
import { createLmStudioTarget } from "@/server/ai/adapters/lmstudio";
import { prompts } from "@/server/ai/prompts";
import { compactDish } from "@/server/ai/schemas";
import { inputLimits, suggestDishesContent, type SuggestDishesInput } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { evalRuns } from "./timing";

// Story 12.7, T9: the probe that decides whether the story builds anything.
// `AI_PROVIDER=lmstudio EVAL_RUNS=3 pnpm eval:ai tests/eval/stream-probe.eval.ts`
//
// Does LM Studio stream an answer held to a JSON schema (response_format) so
// that `elementStream` gives the first dish long before the answer is
// complete? Each run streams the pantry in tests/fixtures/ai with
// `streamText` and `Output.array`, stamps each element and the end, and then
// asks the same with `generateText` and Output.object, as the port did before.
// The verdict is printed: the story goes on when the first element comes after
// at most 80 % of the time to the end, in every run, and the streamed answer is
// no more often invalid than the one from generateText. Never run against the
// mock, and nothing of a prompt or an answer is written, only times and counts.

const env = parseEnv(process.env);
if (env.AI_PROVIDER !== "lmstudio" || !env.LMSTUDIO_BASE_URL || !env.AI_MODEL) {
  throw new Error("The probe needs AI_PROVIDER=lmstudio with LMSTUDIO_BASE_URL and AI_MODEL.");
}
const target = createLmStudioTarget({
  baseURL: env.LMSTUDIO_BASE_URL,
  model: env.AI_MODEL,
  cfAccess:
    env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET
      ? { clientId: env.CF_ACCESS_CLIENT_ID, clientSecret: env.CF_ACCESS_CLIENT_SECRET }
      : undefined,
});
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");
const manifest = JSON.parse(readFileSync(join(fixtures, "manifest.json"), "utf8")) as { suggest: string };
const input = JSON.parse(readFileSync(join(fixtures, `${manifest.suggest}.pantry.json`), "utf8")) as SuggestDishesInput;
const messages = [{ role: "user" as const, content: suggestDishesContent(input) }];

type Run = { firstMs: number | null; elementsMs: number[]; endMs: number; elements: number; valid: boolean };

async function streamed(): Promise<Run> {
  const started = performance.now();
  const elementsMs: number[] = [];
  const result = streamText({
    model: target.model,
    system: prompts.suggestDishesStream,
    messages,
    output: Output.array({ element: compactDish, minItems: 1, maxItems: 3 }),
    providerOptions: target.providerOptions,
    maxOutputTokens: inputLimits.suggest.maxOutputTokens,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(120_000),
    onError: () => {},
  });
  Promise.resolve(result.output).catch(() => {});
  for await (const element of result.elementStream) {
    if (element) elementsMs.push(performance.now() - started);
  }
  const endMs = performance.now() - started;
  let valid = true;
  try {
    await result.output;
  } catch {
    valid = false;
  }
  return { firstMs: elementsMs[0] ?? null, elementsMs, endMs, elements: elementsMs.length, valid };
}

async function whole(): Promise<{ endMs: number; valid: boolean }> {
  const started = performance.now();
  try {
    await generateText({
      model: target.model,
      system: prompts.suggestDishesStream,
      messages,
      output: Output.array({ element: compactDish, minItems: 1, maxItems: 3 }),
      providerOptions: target.providerOptions,
      maxOutputTokens: inputLimits.suggest.maxOutputTokens,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(120_000),
    });
    return { endMs: performance.now() - started, valid: true };
  } catch {
    return { endMs: performance.now() - started, valid: false };
  }
}

describe("streaming probe (Story 12.7, T9)", () => {
  it("tells whether the first dish comes early enough to build on", { timeout: 600_000 }, async () => {
    // A first call wakes the model, so the runs are with a warm one.
    await whole();
    const runs: Run[] = [];
    const wholes: { endMs: number; valid: boolean }[] = [];
    for (let run = 0; run < evalRuns(); run++) {
      runs.push(await streamed());
      wholes.push(await whole());
    }
    const seconds = (ms: number | null) => (ms === null ? "-" : (ms / 1000).toFixed(1));
    const lines = runs.map(
      (run, index) =>
        `run ${index + 1}: first ${seconds(run.firstMs)} s, ${run.elementsMs.map((ms) => seconds(ms)).join("/")} s, end ${seconds(run.endMs)} s, ` +
        `share ${run.firstMs === null ? "-" : Math.round((run.firstMs / run.endMs) * 100)} %, streamed ${run.valid ? "valid" : "INVALID"}, ` +
        `generateText ${seconds(wholes[index].endMs)} s ${wholes[index].valid ? "valid" : "INVALID"}`,
    );
    const early = runs.every((run) => run.firstMs !== null && run.firstMs <= run.endMs * 0.8);
    const invalidStreamed = runs.filter((run) => !run.valid).length;
    const invalidWhole = wholes.filter((one) => !one.valid).length;
    const verdict = early && invalidStreamed <= invalidWhole ? "BUILD: the first dish comes early and the answer is as valid" : "STOP: no streaming";
    console.log(`\n${lines.join("\n")}\nverdict: ${verdict}\n`);
    expect(runs.length).toBeGreaterThan(0);
  });
});
