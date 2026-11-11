import type { AiService, PickRestaurantsInput } from "@/server/ai";
import { checkCap, costSek, type ModelPrice } from "./domain/cost";
import { guardSuggestions } from "./domain/guard";
import type { LlmInput } from "./domain/llm-input";
import type { MenuSource, Suggestion } from "./domain/types";

// The AI half of the run, with the port injected (tested with a fake). The input is the feature's LlmInput, which only
// buildLlmInput makes (no Google field in it). Every answer goes through guardSuggestions; Sonnet 5.5 at medium is asked
// only when the guard rejects something from Haiku 5.5 at low, and only when the run cap and the day's remainder allow it.
// The tokens of each call are saved by the port's usage sink; here they are estimated for the cap checks and the kr shown.

export type PickModel = "haiku-5.5" | "sonnet-5.5";
export type PickPrices = { standard: ModelPrice; careful: ModelPrice };

export type PickOutcome =
  | { status: "ok"; picks: Suggestion[]; model: PickModel; estimatedSek: number; rejected: number }
  /** The cap stopped the first call (`day`: the household's, `run`: this run's), or the port said ai_cap_reached. */
  | { status: "cap_reached"; cap: "run" | "day"; estimatedSek: number }
  | { status: "failed"; code: string; estimatedSek: number };

type Port = Pick<AiService, "pickRestaurants">;

/** About three characters to a token, plus the system prompt (about 800 tokens). */
const tokensInOf = (input: LlmInput) => 800 + Math.ceil(JSON.stringify(input).length / 3);
/** About 90 tokens to a suggestion, and the answer rarely holds more than five. */
const expectedTokensOut = 600;
const tokensOutOf = (suggestions: number) => 100 + suggestions * 90;

export async function pickWithAi(
  ai: Port,
  input: LlmInput,
  sources: readonly MenuSource[],
  prices: PickPrices,
  budget: { spentSek: number; dayRemainingSek: number },
  signal: AbortSignal,
  deadline?: number,
): Promise<PickOutcome> {
  const ids = new Set(input.restaurants.map((restaurant) => restaurant.placeId));
  const portInput = (quality: "standard" | "careful"): PickRestaurantsInput => ({ ...input, quality });
  const options = deadline === undefined ? undefined : { deadline };
  const estimate = (quality: "standard" | "careful", out: number) => costSek(prices[quality], { tokensIn: tokensInOf(input), tokensOut: out, searches: 0, placesRequests: 0 });

  let spent = 0;
  const nextOf = (quality: "standard" | "careful") => estimate(quality, expectedTokensOut);

  const firstCap = checkCap(budget.spentSek, nextOf("standard"), budget.dayRemainingSek);
  if (!firstCap.ok) return { status: "cap_reached", cap: firstCap.cap, estimatedSek: 0 };

  const one = await ai.pickRestaurants(portInput("standard"), signal, options);
  if (!one.ok && one.error.code === "ai_cap_reached") return { status: "cap_reached", cap: "day", estimatedSek: 0 };
  spent += estimate("standard", one.ok ? tokensOutOf(one.data.suggestions.length) : expectedTokensOut);
  const first = one.ok ? guardSuggestions(one.data.suggestions, ids, sources) : null;
  if (first && first.rejected.length === 0) return { status: "ok", picks: first.valid, model: "haiku-5.5", estimatedSek: spent, rejected: 0 };
  // A failed call is only worth a second paid try when the answer was unusable (ai_invalid), as with the week agent.
  if (!one.ok && one.error.code !== "ai_invalid") return { status: "failed", code: one.error.code, estimatedSek: spent };

  const keep = (): PickOutcome =>
    first && first.valid.length > 0
      ? { status: "ok", picks: first.valid, model: "haiku-5.5", estimatedSek: spent, rejected: first.rejected.length }
      : { status: "failed", code: one.ok ? "guard" : one.error.code, estimatedSek: spent };

  const retryCap = checkCap(budget.spentSek + spent, nextOf("careful"), budget.dayRemainingSek - spent);
  if (!retryCap.ok) return keep();
  const two = await ai.pickRestaurants(portInput("careful"), signal, options);
  spent += estimate("careful", two.ok ? tokensOutOf(two.data.suggestions.length) : expectedTokensOut);
  if (!two.ok) return keep();
  const second = guardSuggestions(two.data.suggestions, ids, sources);
  if (second.valid.length >= (first?.valid.length ?? 0) && second.valid.length > 0) return { status: "ok", picks: second.valid, model: "sonnet-5.5", estimatedSek: spent, rejected: second.rejected.length };
  return keep();
}
