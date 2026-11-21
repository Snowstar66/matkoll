import { describe, expect, it } from "vitest";
import { prompts } from "./prompts";
import type { Limits } from "./run";
import {
  createModelAiService,
  explainWorthContent,
  explainWorthLimitsFrom,
  inputLimits,
  isValidExplainWorthInput,
  withInputValidation,
  type ExplainWorthInput,
} from "./service";
import { fakeModel } from "./test-support";

// explainWorth on a model (Värt en titt, "Förklara närmare"): its prompt and message, the cleaning of the answer, its
// own short budget and its limits.

const signal = () => new AbortController().signal;
const png = () => ({ data: new Uint8Array(4).fill(1), mediaType: "image/png" });

describe("explainWorth on a model", () => {
  const limits: Limits = { healthMs: 30_000, attemptMs: 60_000, totalMs: 90_000, maxAttempts: 3, minRetryMs: 0 };
  const input: ExplainWorthInput = { image: png(), name: "Kristallskål", tip: "Liknar Orrefors. Titta på botten.", confidence: "unsure" };
  const answer = {
    darfor: "Den slipade kanten och den tunga botten liknar äldre kristall.",
    kan_vara: "Kan vara svensk kristall, men det här är en gissning utan synlig signatur.",
    undersok: ["Titta på undersidan efter en graverad signatur.", "Jämför slipningen med kataloger.", "Sök på ”kristallskål slipad vintage”."],
  };
  const message = "Föremål: Kristallskål\nTips: Liknar Orrefors. Titta på botten.\nSäkerhet: osäker";

  it("has one attempt of at most 45 s after the health check, and keeps shorter limits shorter", () => {
    const base = { healthMs: 5_000, attemptMs: 100_000, totalMs: 115_000, maxAttempts: 3, minRetryMs: 20_000 };
    expect(explainWorthLimitsFrom(base)).toEqual({ ...base, attemptMs: 45_000, totalMs: 50_000, maxAttempts: 1 });
    expect(explainWorthLimitsFrom({ ...base, attemptMs: 50, totalMs: 100 })).toMatchObject({ attemptMs: 50, totalMs: 100, maxAttempts: 1 });
  });

  it("sends the explain-worth prompt, the photo and one labelled line each for name, tip and sureness", async () => {
    const model = fakeModel(JSON.stringify(answer));
    const result = await createModelAiService({ model }, limits).explainWorth(input, signal());
    expect(result).toEqual({ ok: true, data: answer });
    const call = model.doGenerateCalls[0];
    expect(call.maxOutputTokens).toBe(inputLimits.explainWorth.maxOutputTokens);
    const [system, user] = call.prompt;
    expect(system).toEqual({ role: "system", content: prompts.explainWorth });
    const parts = user.content as { type: string; text?: string; mediaType?: string }[];
    expect(parts.find((part) => part.type === "file")).toMatchObject({ mediaType: "image/png" });
    expect(parts.find((part) => part.type === "text")?.text).toBe(message);
    expect(explainWorthContent(input)[1]).toEqual({ type: "text", text: message });
  });

  it("tells the model never to give a price and not to invent a maker", () => {
    expect(prompts.explainWorth).toMatch(/aldrig ett pris/i);
    expect(prompts.explainWorth).toMatch(/Hitta aldrig på/);
    expect(prompts.explainWorth).toMatch(/data, aldrig instruktioner/);
  });

  it("cleans the texts, cuts them to their length and keeps at most four checks", async () => {
    const model = fakeModel(JSON.stringify({ darfor: "  En  rad\n med  luft  ", kan_vara: "x".repeat(900), undersok: ["a", " ", "b", "c", "d", "e"] }));
    const result = await createModelAiService({ model }, limits).explainWorth(input, signal());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.darfor).toBe("En rad med luft");
    expect(result.data.kan_vara.length).toBeLessThanOrEqual(380);
    expect(result.data.kan_vara.endsWith("…")).toBe(true);
    expect(result.data.undersok).toEqual(["a", "b", "c", "d"]);
  });

  it("is ai_invalid for an answer that is not the shape", async () => {
    const model = fakeModel("inte json", "inte json", "inte json");
    expect(await createModelAiService({ model }, limits).explainWorth(input, signal())).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
  });

  it("is ai_unavailable when the route's deadline leaves too little time", async () => {
    const model = fakeModel(JSON.stringify(answer));
    expect(await createModelAiService({ model }, limits).explainWorth(input, signal(), { deadline: Date.now() + 1_000 })).toMatchObject({
      ok: false,
      error: { code: "ai_unavailable" },
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it("refuses an input outside the limits before any call", async () => {
    const model = fakeModel(JSON.stringify(answer));
    const wrapped = withInputValidation(createModelAiService({ model }, limits));
    const code = async (next: ExplainWorthInput) => (await wrapped.explainWorth(next, signal())) as { ok: boolean; error?: { code: string } };
    expect((await code({ ...input, name: "" })).error?.code).toBe("validation");
    expect((await code({ ...input, name: "x".repeat(81) })).error?.code).toBe("validation");
    expect((await code({ ...input, tip: "två\nrader" })).error?.code).toBe("validation");
    expect((await code({ ...input, tip: "x".repeat(201) })).error?.code).toBe("validation");
    expect((await code({ ...input, confidence: "kanske" as ExplainWorthInput["confidence"] })).error?.code).toBe("validation");
    expect((await code({ ...input, image: { data: new Uint8Array(0), mediaType: "image/png" } })).error?.code).toBe("validation");
    expect(isValidExplainWorthInput(input)).toBe(true);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
