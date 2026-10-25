import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ModelTarget } from "../run";

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
      // Passed through to the request body. Qwen3.6's chat template reads
      // enable_thinking; without this the model thinks before every answer,
      // which costs most of the time budget.
      [providerName]: { chat_template_kwargs: { enable_thinking: false } },
    },
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
