import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import type { ModelTarget } from "../run";

export type OpenAiConfig = { apiKey: string; model: string; fetch?: typeof fetch };

export function createOpenAiTarget(config: OpenAiConfig): ModelTarget {
  const provider = createOpenAI({ apiKey: config.apiKey, fetch: config.fetch });
  // Strict JSON schema (the SDK's default): every property in the schemas is required.
  // Kylfoto C: the fridge photo's items are read while the model writes them.
  return { model: provider(config.model), streaming: true };
}
