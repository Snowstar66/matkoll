import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { fail, ok, type Result } from "@/lib/errors";

// The one place that talks to Anthropic's web search tool (Restaurangagenten). It calls the Messages API directly with
// the official SDK, because the port's other calls go through the AI SDK, which has no use for a server tool's blocks.
// Server tools run on Anthropic's side: no loop of ours, the answer comes back with `web_search_tool_result` blocks.
//
// The tool type is the basic `web_search_20250305`, which the claude-api docs list for every model; the newer
// `web_search_20260209` (dynamic filtering) is documented for Sonnet 5.5 but not for Haiku 5.5, so it is not used.
// Not checked against the live API (no key in the build environment): see docs/restaurant-agent-eval.md.

export type WebSearchRequest = {
  model: string;
  effort: "low" | "medium";
  system: string;
  user: string;
  /** The typed city for `user_location`; null when the place is a postcode (then it is in the message only). */
  city: string | null;
  maxSearches: number;
  maxOutputTokens: number;
  timeoutMs: number;
};

export type WebSearchTurn = {
  /** The model's written answer (all its text blocks, in order). */
  text: string;
  /** Every page address a `web_search_tool_result` block returned. */
  sourceUrls: string[];
  /** Web searches made, from the response's own usage. */
  searches: number;
  inputTokens: number;
  outputTokens: number;
};

export type WebSearchRunner = (request: WebSearchRequest, signal: AbortSignal) => Promise<Result<WebSearchTurn>>;

/** A search can pause the turn after its server-side loop; at most this many times the request is sent again to resume. */
const maxResumes = 2;

export function createAnthropicWebSearch(config: { apiKey: string; fetch?: typeof fetch }): WebSearchRunner {
  const client = new Anthropic({ apiKey: config.apiKey, fetch: config.fetch, maxRetries: 1 });
  return async (request, signal) => {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: request.user }];
    const urls = new Set<string>();
    const texts: string[] = [];
    let searches = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      for (let turn = 0; turn <= maxResumes; turn += 1) {
        const response = await client.messages.create(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages,
            output_config: { effort: request.effort },
            tools: [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: request.maxSearches,
                user_location: { type: "approximate", country: "SE", ...(request.city ? { city: request.city } : {}) },
              },
            ],
          },
          { signal, timeout: request.timeoutMs },
        );
        inputTokens += response.usage.input_tokens;
        outputTokens += response.usage.output_tokens;
        // The response's own count is the one billed; the blocks are the fallback when it is missing.
        let blockSearches = 0;
        for (const block of response.content) {
          if (block.type === "text") texts.push(block.text);
          else if (block.type === "server_tool_use" && block.name === "web_search") blockSearches += 1;
          else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) for (const result of block.content) urls.add(result.url);
        }
        searches += response.usage.server_tool_use?.web_search_requests ?? blockSearches;
        if (response.stop_reason !== "pause_turn") break;
        // Resume: the assistant turn goes back as it was; no extra user message.
        messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });
        texts.length = 0;
      }
    } catch (error) {
      if (signal.aborted) return fail("ai_unavailable");
      // Only a fixed reason and the status are logged, never the prompt or the answer.
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      console.error("web_search_failed", { status: status ?? "none" });
      if (typeof status === "number" && status >= 400 && status < 500 && status !== 408 && status !== 429) return fail("ai_rejected");
      return fail("ai_unavailable");
    }
    return ok({ text: texts.join("\n"), sourceUrls: [...urls], searches, inputTokens, outputTokens });
  };
}

/** The first JSON object in a model's text (it may add a word before or after it), parsed and checked against `schema`; null when none fits. */
export function parseJsonAnswer<T extends z.ZodType>(text: string, schema: T): z.output<T> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
