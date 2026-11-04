import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelTarget, ProviderOptions } from "../run";

export type AnthropicConfig = {
  apiKey: string;
  model: string;
  /** Story 17.5: sent as `output_config.effort`; left out, the model's own default applies. */
  effort?: "low" | "medium" | "high";
  fetch?: typeof fetch;
};

/**
 * Room for the model's own thinking on top of the answer: with adaptive
 * thinking (the default of the 5.5 models) thinking tokens count against
 * max_tokens, and the port's caps are sized for Qwen's answer alone. Claude
 * only bills what it writes.
 */
export const anthropicThinkingRoom = 8_000;

/**
 * Kylfoto A: the models that take `thinking: {type: "disabled"}`, by the
 * Anthropic docs (Thinking, per-model table, checked 2026-11-02): Claude
 * Haiku 5.5 turns thinking off at effort `high` or below (a 400 at `xhigh`
 * and `max`). Claude Opus 5.5 rejects `disabled` at every effort, and Claude
 * Sonnet 5.5 rejects it too (its lowest setting is `between_tools`), so
 * they, and any model not listed here, keep adaptive thinking and only get
 * the lower effort.
 */
const thinkingCanBeOff = ["claude-haiku-5-5"];

/**
 * Kylfoto A: the fridge photo's own settings, for analyzeImage only (recipe
 * import and every other call keep the level from Inställningar). Effort
 * `low`, and thinking off where the model allows it: the reading is a list,
 * and it is the text the model writes that takes the time. With thinking off
 * the request also asks for JSON output without tools, which the docs say
 * works on Haiku 5.5 (the caveat there is about a tool call it may skip).
 * Since 2026-11-04 only the eval's fast mode (EVAL_PHOTO_READING=after) uses
 * it; the app reads the photo at the level from Inställningar.
 */
export function photoReadingOptionsFor(model: string): ProviderOptions {
  const off = thinkingCanBeOff.some((id) => model === id || model.startsWith(`${id}-`));
  return { anthropic: off ? { effort: "low", thinking: { type: "disabled" } } : { effort: "low" } };
}

/**
 * The 5.5 models think adaptively unless the request turns it off, which
 * only Haiku 5.5 allows (photoReadingOptionsFor); `budget_tokens` is
 * rejected by all of them. Depth is set with `effort`. The port sends no
 * temperature, top_p or top_k to Claude either: imageSampling is left
 * unset, and run.ts only raises temperature after an answer that asked for 0.
 */
export function createAnthropicTarget(config: AnthropicConfig): ModelTarget {
  const provider = createAnthropic({ apiKey: config.apiKey, fetch: config.fetch });
  return {
    model: provider(config.model),
    providerOptions: config.effort ? { anthropic: { effort: config.effort } } : undefined,
    // Pontus 2026-11-04: the fridge photo read worse with thinking off at effort low than
    // with the level from Inställningar, so it uses that level again. photoReadingOptionsFor
    // stays for the eval (EVAL_PHOTO_READING) until a measurement says otherwise.
    photoReadingOptions: undefined,
    extraOutputTokens: anthropicThinkingRoom,
    // Kylfoto C: the fridge photo's items are read while the model writes them.
    streaming: true,
  };
}
