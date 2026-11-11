import { describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { findWithAi } from "./ai-find";
import type { LlmInput } from "./domain/llm-input";

const prices = { standard: { usdPerMTokIn: 0.1, usdPerMTokOut: 0.5 }, careful: { usdPerMTokIn: 2, usdPerMTokOut: 10 } };
const input: LlmInput = { place: "Uppsala", party: 2, radiusM: 2000, when: "evening", wantedCuisines: [], priorities: [], household: { people: [] } };
const budget = { spentSek: 0, dayRemainingSek: 10 };
const signal = new AbortController().signal;
const sourced = (name: string, url = "https://a.example/meny") => ({ name, area: null, website: null, why: [{ text: "Har pasta", sourceUrl: url }], menu: null, address: null, hours: null, rating: null, warnings: [] });
const answer = (suggestions: ReturnType<typeof sourced>[], quality: "standard" | "careful" = "standard") => ok({ suggestions, sourceUrls: ["https://a.example/meny"], searches: 2, inputTokens: 20_000, outputTokens: 2_000, quality });

describe("findWithAi", () => {
  it("takes a clean Haiku answer and counts the real tokens and searches in kronor", async () => {
    const find = vi.fn(async (_input: unknown) => answer([sourced("A")]));
    const result = await findWithAi({ findRestaurantsWeb: find as never }, input, prices, budget, signal);
    expect(result).toMatchObject({ status: "ok", model: "haiku-5.5", rejected: 0 });
    expect(find).toHaveBeenCalledTimes(1);
    expect(find.mock.calls[0]?.[0]).toMatchObject({ quality: "standard", place: "Uppsala" });
    // 20k in + 2k out on Haiku is 0.03 kr, and two searches are 0.2 kr.
    expect(result.status === "ok" && result.spentSek).toBeCloseTo(0.23, 2);
  });
  it("asks Sonnet when the guard rejected a place (an invented source) and keeps the better answer", async () => {
    const find = vi.fn(async (request: { quality: string }) => (request.quality === "standard" ? answer([sourced("A"), sourced("B", "https://invented.example/")]) : answer([sourced("A"), sourced("C")], "careful")));
    const result = await findWithAi({ findRestaurantsWeb: find as never }, input, prices, budget, signal);
    expect(find).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    expect(result.status === "ok" && result.picks.map((pick) => pick.name)).toEqual(["A", "C"]);
  });
  it("keeps the first answer's valid places when Sonnet cannot be afforded", async () => {
    const find = vi.fn(async (_input: unknown) => answer([sourced("A"), sourced("B", "https://invented.example/")]));
    // 0.5 kr left: Haiku's call is allowed, a Sonnet retry (about 1.1 kr) is not.
    const result = await findWithAi({ findRestaurantsWeb: find as never }, input, prices, { spentSek: 0, dayRemainingSek: 0.5 }, signal);
    expect(find).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: "ok", model: "haiku-5.5", rejected: 1 });
    expect(result.status === "ok" && result.picks.map((pick) => pick.name)).toEqual(["A"]);
  });
  it("does not start at all when the run cap or the day's remainder is out", async () => {
    const find = vi.fn(async (_input: unknown) => answer([sourced("A")]));
    expect(await findWithAi({ findRestaurantsWeb: find as never }, input, prices, { spentSek: 1.95, dayRemainingSek: 10 }, signal)).toMatchObject({ status: "cap_reached", cap: "run" });
    expect(await findWithAi({ findRestaurantsWeb: find as never }, input, prices, { spentSek: 0, dayRemainingSek: 0.1 }, signal)).toMatchObject({ status: "cap_reached", cap: "day" });
    expect(find).not.toHaveBeenCalled();
  });
  it("does not start when the run or the day cap is already out, and passes on the port's cap answer", async () => {
    const capped = vi.fn(async () => fail("ai_cap_reached"));
    expect(await findWithAi({ findRestaurantsWeb: capped as never }, input, prices, budget, signal)).toMatchObject({ status: "cap_reached", cap: "day", spentSek: 0 });
  });
  it("retries on an unusable answer (ai_invalid) but not on other failures", async () => {
    const invalid = vi.fn(async (request: { quality: string }) => (request.quality === "standard" ? fail("ai_invalid") : answer([sourced("A")], "careful")));
    expect(await findWithAi({ findRestaurantsWeb: invalid as never }, input, prices, budget, signal)).toMatchObject({ status: "ok", model: "sonnet-5.5" });
    const down = vi.fn(async () => fail("ai_unavailable"));
    expect(await findWithAi({ findRestaurantsWeb: down as never }, input, prices, budget, signal)).toMatchObject({ status: "failed", code: "ai_unavailable" });
    expect(down).toHaveBeenCalledTimes(1);
  });
  it("fails when every place was dropped by the guard and Sonnet did no better", async () => {
    const find = vi.fn(async () => answer([sourced("B", "https://invented.example/")]));
    expect(await findWithAi({ findRestaurantsWeb: find as never }, input, prices, budget, signal)).toMatchObject({ status: "failed", code: "guard" });
  });
});
