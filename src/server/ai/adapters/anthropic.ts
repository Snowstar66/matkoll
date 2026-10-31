import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelTarget } from "../run";

export type AnthropicConfig = {
  apiKey: string;
  model: string;
  /** Story 17.5: sent as `output_config.effort`; left out, the model's own default applies. */
  effort?: "low" | "medium" | "high";
  fetch?: typeof fetch;
};

/**
 * Room for the model's own thinking on top of the answer: with adaptive
 * thinking (the only mode of the 5.5 models) thinking tokens count against
 * max_tokens, and the port's caps are sized for Qwen's answer alone. Claude
 * only bills what it writes.
 */
export const anthropicThinkingRoom = 8_000;

/**
 * The 5.5 models always think adaptively, so the request omits `thinking`
 * (`disabled` and `budget_tokens` are rejected) and controls depth with
 * `effort` only. The port sends no temperature, top_p or top_k to Claude
 * either: imageSampling is left unset, and run.ts only raises temperature
 * after an answer that asked for 0.
 */
export function createAnthropicTarget(config: AnthropicConfig): ModelTarget {
  const provider = createAnthropic({ apiKey: config.apiKey, fetch: config.fetch });
  return {
    model: provider(config.model),
    providerOptions: config.effort ? { anthropic: { effort: config.effort } } : undefined,
    extraOutputTokens: anthropicThinkingRoom,
  };
}
