import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelTarget, Sampling } from "../run";

// LM Studio's OpenAI-compatible server, locally on http://localhost:1234/v1 and
// in the cloud behind Cloudflare Tunnel + Access (AD-9, AD-14).

export type LmStudioConfig = {
  baseURL: string;
  model: string;
  cfAccess?: { clientId: string; clientSecret: string };
  /** For tests: replaces the global fetch for both the health check and the model. */
  fetch?: typeof fetch;
};

const providerName = "lmstudio";

/**
 * Sampling for analyzeImage (Story 6.5): Qwen's recommended settings without
 * thinking. With LM Studio's defaults a photo of 1600 px gave repetition loops
 * ("Grädde" twelve times); with these, 2048 px gave none in the experiment of
 * 2026-10-26 (docs/beslutslogg.md). The AI SDK's openai-compatible model drops
 * `topK` with a warning, so top_k goes in the provider options, which are
 * passed on in the request body. The other calls keep LM Studio's defaults:
 * nothing has been measured for them. Only for a Qwen model (isQwenModel):
 * the values are Qwen's, so another model keeps its own defaults.
 *
 * Temperature is 0, not Qwen's 0.7: the same photo must give the same
 * reading. Measured on 2026-10-26 with a real fridge photo at 2048 px, three
 * runs each: at 0.7 the item names overlapped by only 0.13-0.24 (Jaccard)
 * and the count varied from 14 to 25; a fixed seed did not help (LM Studio
 * ignores it); at 0 all three answers were byte-identical, in about 30 s,
 * without repetition loops. presencePenalty stays, since it still guards
 * against loops at greedy decoding; topP and top_k do nothing at 0 and stay
 * as Qwen's values. The stability is only this: LM Studio with a Qwen model
 * and byte-identical input. Other models and providers keep their defaults,
 * and a photo taken again is other bytes, so it may read differently. A new
 * attempt after an invalid answer samples at retryTemperature (run.ts), so a
 * deterministic failure can come out differently.
 */
export const lmStudioImageSampling: Sampling = {
  temperature: 0,
  topP: 0.8,
  presencePenalty: 1.5,
  providerOptions: { [providerName]: { top_k: 20 } },
};

/** Whether the configured model is a Qwen model, which lmStudioImageSampling is for. */
export function isQwenModel(model: string): boolean {
  return /qwen/i.test(model);
}

export function createLmStudioTarget(config: LmStudioConfig): ModelTarget {
  const baseURL = config.baseURL.replace(/\/+$/, "");
  const headers: Record<string, string> = config.cfAccess
    ? {
        "CF-Access-Client-Id": config.cfAccess.clientId,
        "CF-Access-Client-Secret": config.cfAccess.clientSecret,
      }
    : {};
  const fetchImpl = config.fetch ?? fetch;

  const provider = createOpenAICompatible({
    name: providerName,
    baseURL,
    headers,
    supportsStructuredOutputs: true,
    fetch: config.fetch,
  });

  return {
    model: provider.chatModel(config.model),
    providerOptions: {
      // Passed through to the request body. LM Studio only turns Qwen3.6's
      // thinking off with reasoning_effort "none": with chat_template_kwargs
      // alone, the whole answer lands in reasoning_content and content is empty
      // (found in the Story 1.4 smoke test). enable_thinking is kept for servers
      // that read the chat template directly.
      [providerName]: {
        reasoningEffort: "none",
        chat_template_kwargs: { enable_thinking: false },
      },
    },
    imageSampling: isQwenModel(config.model) ? lmStudioImageSampling : undefined,
    // Story 6.6: Qwen's vision models point in thousandths of the photo; another model is not asked.
    supportsGrounding: isQwenModel(config.model),
    // Story 12.2: the model on Pontus's Mac goes cold after some minutes without calls.
    warmUpKey: `lmstudio:${config.model}`,
    // GET /models answers fast even while a model is busy, so a sleeping Mac or
    // a stopped server is found in seconds instead of after the attempt budget.
    healthCheck: async (signal) => {
      const response = await fetchImpl(`${baseURL}/models`, { headers, signal });
      if (!response.ok) {
        // Release the connection without waiting for the body.
        void response.body?.cancel().catch(() => {});
        return "unreachable";
      }
      // An HTML page (for example a Cloudflare login page) is not LM Studio.
      const body: unknown = await response.json().catch(() => undefined);
      const models = (body as { data?: unknown } | undefined)?.data;
      if (!Array.isArray(models)) return "unreachable";
      const ids = models.map((entry) => (entry as { id?: unknown } | null)?.id);
      return ids.includes(config.model) ? "ok" : "model_not_loaded";
    },
  };
}
