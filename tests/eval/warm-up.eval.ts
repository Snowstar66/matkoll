import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, describe, expect, it } from "vitest";
import { analyzePlaces, createAiService, type AnalyzePlace, type SuggestDishesInput, type WarmUpOutcome } from "@/server/ai/service";
import { parseEnv } from "@/server/env-schema";
import { photoTypes, preparePhoto } from "./photos";
import {
  evalLabel,
  installUsageMeter,
  lmStudioSettings,
  machineState,
  timingRow,
  writeTimingReport,
  type TimingRow,
} from "./timing";

// Story 12.2: does waking the model make the first real call after a rest
// faster? Runs only with EVAL_WARM set, so a plain `pnpm eval:ai` skips it:
//
//   EVAL_WARM=med  EVAL_LABEL=kall-med-vackning  AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/warm-up.eval.ts
//   EVAL_WARM=utan EVAL_LABEL=kall-utan-vackning AI_PROVIDER=lmstudio pnpm eval:ai tests/eval/warm-up.eval.ts
//
// Each invocation makes one first call per flow: the reading of a photo
// (analyzeImage, the first of Pontus's photos in tests/eval/photos/ with an
// expected.json, or EVAL_PHOTOS_DIR) and AI-förslag (suggestDishes with the
// pantry in tests/fixtures/ai/suggest-dishes.pantry.json). EVAL_WARM_FLOW=bild
// or =forslag runs only one. With EVAL_WARM=med, warmUp for the flow's kind
// starts EVAL_WARM_LEAD_MS (default 5 000) before the real call, as when
// Pontus opens Lagersaldo and takes the photo five seconds later, and is not
// waited for. The model must have rested before each invocation (the caller
// waits; a row says how long it had). Rows go to tests/eval/reports/ as
// "första bildanalys" and "första förslag" under EVAL_LABEL. Photos only go to
// LM Studio on this computer, and nothing of a photo or an answer is printed.

const mode = process.env.EVAL_WARM;
const flowFilter = process.env.EVAL_WARM_FLOW;
const leadMs = Number(process.env.EVAL_WARM_LEAD_MS ?? 5_000);
const photosDir = process.env.EVAL_PHOTOS_DIR || join(process.cwd(), "tests", "eval", "photos");
const fixtures = join(process.cwd(), "tests", "fixtures", "ai");

const env = parseEnv(process.env);
// The warm-up gets its own fetch, so its tokens are never counted in the real call's row.
const warmService = createAiService(env, { fetch: globalThis.fetch.bind(globalThis) });
const meter = installUsageMeter();
const service = createAiService(env);
const timings: TimingRow[] = [];
const warmUps: { flow: string; outcome: WarmUpOutcome; seconds: number }[] = [];

function firstPhoto(): { path: string; place: AnalyzePlace } | null {
  if (!existsSync(photosDir)) return null;
  const file = readdirSync(photosDir)
    .filter((name) => photoTypes.has(extname(name).toLowerCase()))
    .filter((name) => !name.startsWith("syntetisk"))
    .sort((a, b) => a.localeCompare(b, "sv"))
    .find((name) => existsSync(join(photosDir, `${name.slice(0, -extname(name).length)}.expected.json`)));
  if (!file) return null;
  const expected = JSON.parse(readFileSync(join(photosDir, `${file.slice(0, -extname(file).length)}.expected.json`), "utf8")) as {
    place: AnalyzePlace;
  };
  if (!(analyzePlaces as readonly string[]).includes(expected.place)) return null;
  return { path: join(photosDir, file), place: expected.place };
}

const isLocal = env.AI_PROVIDER === "lmstudio" && ["localhost", "127.0.0.1"].includes(new URL(env.LMSTUDIO_BASE_URL ?? "http://x").hostname);

/** Starts the warm-up when asked for, without waiting for it, and waits the lead time. */
async function warmFirst(flow: string, kind: "image" | "text") {
  if (mode !== "med") return;
  const started = performance.now();
  void warmService.warmUp(kind, AbortSignal.timeout(60_000)).then((outcome) => {
    warmUps.push({ flow, outcome, seconds: (performance.now() - started) / 1000 });
  });
  await sleep(leadMs);
}

describe("väckningen före det första anropet (Story 12.2)", () => {
  if (mode !== "med" && mode !== "utan") {
    it.skip("sätt EVAL_WARM=med eller EVAL_WARM=utan för att mäta väckningen", () => {});
    return;
  }
  if (!isLocal) {
    it.skip("mäter bara mot LM Studio på den här datorn", () => {});
    return;
  }

  it.runIf(flowFilter !== "forslag")("första bildanalysen", { timeout: 200_000 }, async () => {
    const photo = firstPhoto();
    if (!photo) throw new Error(`inga egna foton med <namn>.expected.json i ${photosDir}`);
    const image = preparePhoto(photo.path);
    if ("error" in image) throw new Error(image.error);
    const state = machineState(env.AI_MODEL);
    await warmFirst("bild", "image");
    const startedAt = new Date();
    const measured = await meter.measure(() =>
      service.analyzeImage({ image, place: photo.place }, AbortSignal.timeout(120_000)),
    );
    timings.push(timingRow("första bildanalys", 1, state, measured, measured.value.ok, startedAt));
    expect(measured.value.ok).toBe(true);
  });

  it.runIf(flowFilter !== "bild")("första förslagen", { timeout: 200_000 }, async () => {
    const input = JSON.parse(readFileSync(join(fixtures, "suggest-dishes.pantry.json"), "utf8")) as SuggestDishesInput;
    const state = machineState(env.AI_MODEL);
    await warmFirst("förslag", "text");
    const startedAt = new Date();
    const measured = await meter.measure(() => service.suggestDishes(input, AbortSignal.timeout(120_000)));
    timings.push(timingRow("första förslag", 1, state, measured, measured.value.ok, startedAt));
    expect(measured.value.ok).toBe(true);
  });
});

afterAll(async () => {
  // A warm-up still on its way is given its 30 s, so its result is in the header.
  for (let waited = 0; mode === "med" && warmUps.length < timings.length && waited < 30; waited += 1) await sleep(1_000);
  writeTimingReport(
    "väckning",
    [
      `Leverantör: ${env.AI_PROVIDER}`,
      `Modell: ${env.AI_MODEL ?? "–"}`,
      `LM Studio: ${lmStudioSettings(env.AI_MODEL)}`,
      `Läge: ${evalLabel()}`,
      `Väckning: ${mode === "med" ? `${leadMs / 1000} s före` : "ingen"}`,
      ...warmUps.map((warm) => `Väckningen (${warm.flow}): ${warm.outcome} efter ${warm.seconds.toFixed(1)} s`),
    ],
    timings,
  );
});
