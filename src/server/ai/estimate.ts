import "server-only";
import type { ModelMessage } from "ai";
import { z } from "zod";
import { imageSizeOf } from "@/lib/images";

// Tak för AI-kostnad (security review S-01, S-02): how many tokens a call sends and may write, when
// the provider has not said (an aborted, timed-out or failed attempt), and as the worst case a run
// reserves before it asks the model. The figures err high: they are turned into kronor with the
// same price table as real usage (features/settings/domain/ai-usage.ts), so an estimate never lets
// a household spend more than the cap would.

/** Characters per token: Claude averages about 3.5-4 for Swedish text and JSON; 3 errs high. */
const charsPerToken = 3;

/**
 * An image's tokens: about width × height / 750 (Anthropic's rule), at most what the largest image
 * a model takes costs (about 4 800 tokens at 2 576 px); the most when the size cannot be read.
 */
export const maxImageTokens = 4_800;

/** Tokens per message for the roles and separators around it. */
const messageOverheadTokens = 10;

/** The tokens of a text. */
export function textTokens(text: string): number {
  return Math.ceil(text.length / charsPerToken);
}

/** The tokens of an image from its bytes (or base64), by its size when it can be read. */
export function imageTokens(data: unknown): number {
  const bytes =
    data instanceof Uint8Array ? data : typeof data === "string" && !/^https?:/i.test(data) ? Buffer.from(data.slice(0, 200_000), "base64") : null;
  const size = bytes ? imageSizeOf(bytes) : null;
  if (!size) return maxImageTokens;
  return Math.min(maxImageTokens, Math.ceil((size.width * size.height) / 750));
}

/** The tokens of one part of a message's content. */
function partTokens(part: unknown): number {
  if (!part || typeof part !== "object") return 0;
  const { type } = part as { type?: unknown };
  if (type === "text" || type === "reasoning") return textTokens(String((part as { text?: unknown }).text ?? ""));
  if (type === "image") return imageTokens((part as { image?: unknown }).image);
  if (type === "file") {
    const { data, mediaType } = part as { data?: unknown; mediaType?: unknown };
    return typeof mediaType === "string" && mediaType.startsWith("image/") ? imageTokens(data) : textTokens(JSON.stringify(data ?? "").slice(0, 2_000_000));
  }
  return textTokens(JSON.stringify(part));
}

/** The tokens a call sends: the system prompt, every message (text and images), and the answer's schema when there is one. */
export function estimateInputTokens(system: string, messages: readonly ModelMessage[], schema?: z.ZodType): number {
  let tokens = textTokens(system);
  for (const message of messages) {
    tokens += messageOverheadTokens;
    tokens += typeof message.content === "string" ? textTokens(message.content) : message.content.reduce((sum, part) => sum + partTokens(part), 0);
  }
  return tokens + schemaTokens(schema);
}

/** The schema the SDK sends with a structured call, as JSON; a fixed 1 000 when it cannot be written out. */
function schemaTokens(schema: z.ZodType | undefined): number {
  if (!schema) return 0;
  try {
    return textTokens(JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" })));
  } catch {
    return 1_000;
  }
}

/** The tokens of an answer written so far (a partial object of a streamed answer). */
export function writtenTokens(partial: unknown): number {
  if (partial === undefined) return 0;
  try {
    return textTokens(JSON.stringify(partial) ?? "");
  } catch {
    return 0;
  }
}
