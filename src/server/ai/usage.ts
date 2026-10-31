import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// What an AI call used (Story 17.6): the model id and the tokens in and out,
// reported once per call of the port, over all its attempts. Never a prompt,
// an answer or a photo. The caller that wants it passes a sink to
// getAiServiceFor; the sink is found through AsyncLocalStorage, so the shared
// adapters need no sink of their own and a cached service serves any caller.

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };
export type AiUsageSink = (usage: AiUsage) => void | Promise<void>;

const sinks = new AsyncLocalStorage<AiUsageSink>();

/** Runs `run` so that usage reported inside it goes to `sink`. */
export function withUsageSink<T>(sink: AiUsageSink, run: () => T): T {
  return sinks.run(sink, run);
}

/** Reports usage to the sink of the running call, if any. Never throws: usage must not fail a call. */
/** How long a usage record may hold up the AI run's answer. */
const reportTimeoutMs = 3_000;

export async function reportUsage(usage: AiUsage): Promise<void> {
  const sink = sinks.getStore();
  if (!sink) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A slow or hung insert never delays the answer: the record is given up instead.
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), reportTimeoutMs);
    });
    if ((await Promise.race([sink(usage), timedOut])) === "timeout") console.error("ai_usage_unrecorded");
  } catch {
    console.error("ai_usage_unrecorded");
  } finally {
    clearTimeout(timer);
  }
}

/** A token count from the SDK, which may be missing: 0 then. */
export function tokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
