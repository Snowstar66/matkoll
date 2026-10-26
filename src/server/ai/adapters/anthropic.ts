import "server-only";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ModelTarget } from "../run";

export type AnthropicConfig = { apiKey: string; model: string; fetch?: typeof fetch };

export function createAnthropicTarget(config: AnthropicConfig): ModelTarget {
  const provider = createAnthropic({ apiKey: config.apiKey, fetch: config.fetch });
  return { model: provider(config.model) };
}
