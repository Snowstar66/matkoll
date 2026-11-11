import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

// What an AI call used (Story 17.6): the model id and the tokens in and out,
// reported once per call of the port, over all its attempts. Never a prompt,
// an answer or a photo. The caller that wants it passes a sink to
// getAiServiceFor; the sink is found through AsyncLocalStorage, so the shared
// adapters need no sink of their own and a cached service serves any caller.
//
// Tak för AI-kostnad (security review S-01, S-02): a caller may also pass a
// reserver. Then every run first reserves its worst case against the
// household's cap (holdUsage), before the model is asked, and settles the
// reservation with what it used afterwards, also when it was aborted, timed
// out or failed. Without a reserver, the usage goes to the sink as before.

export type AiUsage = { model: string; inputTokens: number; outputTokens: number };
export type AiUsageSink = (usage: AiUsage) => void | Promise<void>;

/** Why a reservation was refused: the household's cap is reached, or it could not be checked (fails closed). */
export type AiCapRefusal = "ai_cap_reached" | "ai_cap_check_failed";

/** A run's hold on the household's cap: settled once with what the run used (an empty list releases it). Never throws. */
export type AiUsageHold = { settle: (usage: readonly AiUsage[]) => Promise<void> };

/** Reserves `estimate` (the run's worst case) before the run asks the model. */
export type AiUsageReserver = (estimate: readonly AiUsage[]) => Promise<{ ok: true; hold: AiUsageHold } | { ok: false; code: AiCapRefusal }>;

type Meter = { sink?: AiUsageSink; reserve?: AiUsageReserver };

const meters = new AsyncLocalStorage<Meter>();

/** Runs `run` so that usage reported inside it goes to `sink`, and (with `reserve`) every run reserves first. */
export function withUsageSink<T>(sink: AiUsageSink | undefined, run: () => T, reserve?: AiUsageReserver): T {
  return meters.run({ sink, reserve }, run);
}

/** How long a usage record, a reservation or a settlement may hold up the AI run. */
const reportTimeoutMs = 3_000;

/** `work`, or "timeout" after reportTimeoutMs; never throws (a failure is "failed"). */
async function bounded<T>(work: () => Promise<T> | T): Promise<{ done: true; value: T } | { done: false; why: "timeout" | "failed" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), reportTimeoutMs);
    });
    const value = await Promise.race([Promise.resolve().then(work).then((result) => ({ result })), timedOut]);
    return value === "timeout" ? { done: false, why: "timeout" } : { done: true, value: value.result };
  } catch {
    return { done: false, why: "failed" };
  } finally {
    clearTimeout(timer);
  }
}

/** Reports usage to the sink of the running call, if any. Never throws: usage must not fail a call. */
export async function reportUsage(usage: AiUsage): Promise<void> {
  const sink = meters.getStore()?.sink;
  if (!sink) return;
  // A slow or hung insert never delays the answer: the record is given up instead.
  if (!(await bounded(() => sink(usage))).done) console.error("ai_usage_unrecorded");
}

/** What holdUsage gives a run that may go on: `finish` records what it used, once. */
export type UsageHeld = { ok: true; finish: (usage: readonly AiUsage[]) => Promise<void> };

/**
 * Reserves `estimate` (the run's worst case) with the running call's reserver, before the model is
 * asked. Refused (`ok: false`) when the household's cap is reached, or when the reservation cannot
 * be made in time (fails closed). Without a reserver the run goes on and `finish` reports to the
 * sink as before. `finish` never throws; a settlement that fails leaves the reservation counted at
 * its estimate, which errs on the side of the cap.
 */
export async function holdUsage(estimate: readonly AiUsage[]): Promise<UsageHeld | { ok: false; code: AiCapRefusal }> {
  const reserve = meters.getStore()?.reserve;
  if (!reserve) {
    return {
      ok: true,
      finish: async (usage) => {
        for (const row of usage) await reportUsage(row);
      },
    };
  }
  const reserved = await bounded(() => reserve(estimate));
  if (!reserved.done) {
    console.error("ai_cap_check_failed", { reason: `reserve_${reserved.why}` });
    return { ok: false, code: "ai_cap_check_failed" };
  }
  if (!reserved.value.ok) return reserved.value;
  const { hold } = reserved.value;
  return {
    ok: true,
    finish: async (usage) => {
      if (!(await bounded(() => hold.settle(usage))).done) console.error("ai_usage_unrecorded");
    },
  };
}

/** A token count from the SDK, which may be missing: 0 then. */
export function tokenCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
