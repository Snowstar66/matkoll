import type { AiService } from "@/server/ai";
import { checkCap, costSek, type ModelPrice } from "./domain/cost";
import { guardSuggestions } from "./domain/guard";
import type { LlmInput } from "./domain/llm-input";
import type { Suggestion } from "./domain/types";

// The AI half of the run, with the port injected (tested with a fake). The model searches the web itself; every answer
// goes through guardSuggestions, which only lets a source through that the search tool returned. Sonnet 5.5 at medium is
// asked only when the guard rejected something from Haiku 5.5 at low, and only when the run cap and the day's remainder
// allow it. The cost is the real one the port reports: tokens and searches in kronor.

export type FindModel = "haiku-5.5" | "sonnet-5.5";
export type FindPrices = { standard: ModelPrice; careful: ModelPrice };

export type FindOutcome =
  | { status: "ok"; picks: Suggestion[]; model: FindModel; spentSek: number; rejected: number }
  /** The cap stopped the first call (`day`: the household's, `run`: this run's), or the port said ai_cap_reached. */
  | { status: "cap_reached"; cap: "run" | "day"; spentSek: number }
  | { status: "failed"; code: string; spentSek: number };

type Port = Pick<AiService, "findRestaurantsWeb">;

/** What one call is expected to use, for the cap check before it starts: about 30 000 tokens in (the search results), 3 000 out, two searches. */
const expected = { tokensIn: 30_000, tokensOut: 3_000, searches: 2 };

export async function findWithAi(ai: Port, input: LlmInput, prices: FindPrices, budget: { spentSek: number; dayRemainingSek: number }, signal: AbortSignal, deadline?: number): Promise<FindOutcome> {
  const options = deadline === undefined ? undefined : { deadline };
  const next = (quality: "standard" | "careful") => costSek(prices[quality], expected);
  const actual = (quality: "standard" | "careful", result: { inputTokens: number; outputTokens: number; searches: number } | null) =>
    costSek(prices[quality], result ? { tokensIn: result.inputTokens, tokensOut: result.outputTokens, searches: result.searches } : expected);

  const firstCap = checkCap(budget.spentSek, next("standard"), budget.dayRemainingSek);
  if (!firstCap.ok) return { status: "cap_reached", cap: firstCap.cap, spentSek: 0 };

  let spent = 0;
  const one = await ai.findRestaurantsWeb({ ...input, quality: "standard" }, signal, options);
  if (!one.ok && one.error.code === "ai_cap_reached") return { status: "cap_reached", cap: "day", spentSek: 0 };
  // A failed call may still have been billed (an answer that did not parse): count it at the expected cost.
  spent += actual("standard", one.ok ? one.data : one.error.code === "ai_invalid" ? null : { inputTokens: 0, outputTokens: 0, searches: 0 });
  const first = one.ok ? guardSuggestions(one.data.suggestions, one.data.sourceUrls) : null;
  if (first && first.rejected.length === 0 && first.valid.length > 0) return { status: "ok", picks: first.valid, model: "haiku-5.5", spentSek: spent, rejected: 0 };
  // A failed call is only worth a second paid try when the answer was unusable (ai_invalid), as with the week agent.
  if (!one.ok && one.error.code !== "ai_invalid") return { status: "failed", code: one.error.code, spentSek: spent };

  const keep = (): FindOutcome =>
    first && first.valid.length > 0 ? { status: "ok", picks: first.valid, model: "haiku-5.5", spentSek: spent, rejected: first.rejected.length } : { status: "failed", code: one.ok ? "guard" : one.error.code, spentSek: spent };

  const retryCap = checkCap(budget.spentSek + spent, next("careful"), budget.dayRemainingSek - spent);
  if (!retryCap.ok) return keep();
  const two = await ai.findRestaurantsWeb({ ...input, quality: "careful" }, signal, options);
  spent += actual("careful", two.ok ? two.data : two.error.code === "ai_invalid" ? null : { inputTokens: 0, outputTokens: 0, searches: 0 });
  if (!two.ok) return keep();
  const second = guardSuggestions(two.data.suggestions, two.data.sourceUrls);
  if (second.valid.length >= (first?.valid.length ?? 0) && second.valid.length > 0) return { status: "ok", picks: second.valid, model: "sonnet-5.5", spentSek: spent, rejected: second.rejected.length };
  return keep();
}
