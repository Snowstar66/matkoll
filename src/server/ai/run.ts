import "server-only";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { z } from "zod";
import { fail, ok, type Result } from "@/lib/errors";

// Shared execution for every real adapter (AD-9): an optional health check,
// a time budget per attempt and in total, at most two new attempts when the
// answer does not match the schema (each told what was wrong), ai_rejected
// when the provider refuses the request (HTTP 4xx) and ai_unavailable at once
// when the model cannot be reached. Only error codes, a fixed reason and the
// HTTP status are logged, never prompts, input, answers or keys.

export type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

export type HealthResult = "ok" | "unreachable" | "model_not_loaded";

/**
 * Sampling for one kind of call. Fields left out keep the provider's
 * defaults. `providerOptions` carries what the AI SDK has no shared setting
 * for (LM Studio's top_k), merged per provider with the target's own.
 */
export type Sampling = {
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  providerOptions?: ProviderOptions;
};

/** A configured model from one of the adapters. */
export type ModelTarget = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  /** Checks that the model server answers and has the model; called before the first attempt. */
  healthCheck?: (signal: AbortSignal) => Promise<HealthResult>;
  /** Sampling for analyzeImage (Story 6.5); without it, the provider's defaults. */
  imageSampling?: Sampling;
  /**
   * Story 6.6: the model is trained to point at things on a photo in
   * thousandths (0–1000), as Qwen's vision models are, so locateItems may ask
   * it. Without it, locateItems answers ai_unavailable at once and the photo
   * is never sent a second time.
   */
  supportsGrounding?: boolean;
  /**
   * Story 12.2: the model runs on Pontus's Mac and goes cold after some
   * minutes without calls, so warmUp is worth a call. Without it, warmUp
   * does nothing: a cloud model is never cold for us, and a call costs money.
   */
  warmsUp?: boolean;
};

export type Limits = {
  /** Budget for the health check, which also catches a server that does not accept connections. */
  healthMs: number;
  /** Budget for one model call. */
  attemptMs: number;
  /** Budget for the whole run, including the health check and all attempts. */
  totalMs: number;
  /** Model calls when answers do not match the schema: the first one plus two new attempts. */
  maxAttempts: number;
  /** A new attempt starts only when at least this much of the total budget is left. */
  minRetryMs: number;
};

/**
 * AD-9: a real recipe page takes Qwen in LM Studio 40–60 s to answer, so one
 * attempt may use most of the total. A new attempt that could not finish
 * anyway is not started.
 */
export const defaultLimits: Limits = {
  healthMs: 5_000,
  attemptMs: 100_000,
  totalMs: 115_000,
  maxAttempts: 3,
  minRetryMs: 20_000,
};

/**
 * The temperature of a new attempt after an invalid answer, when the call
 * asked for 0: at 0 the same input gives the same answer, so a new attempt
 * that also decodes greedily could fail the same way (quick fix after Story
 * 6.5). The feedback message changes the input, but not always enough.
 */
export const retryTemperature = 0.3;

export type StructuredRequest<SCHEMA extends z.ZodType> = {
  schema: SCHEMA;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
  /** Sampling for this call; without it, the provider's defaults. */
  sampling?: Sampling;
  /** Called when the model stopped at maxOutputTokens (finish reason `length`), with or without a valid answer. */
  onTruncated?: () => void;
};

type FailCode = "ai_unavailable" | "ai_invalid" | "ai_rejected";

/** Why a run failed. Logged next to the code; it never carries input or provider text. */
type Reason = "aborted" | "health" | "model_not_loaded" | "timeout" | "connection" | "rejected" | "invalid";

function failWith(code: FailCode, reason: Reason, statusCode?: number) {
  const details = statusCode === undefined ? { reason } : { reason, statusCode };
  // A caller that aborts (Pontus pressed Avbryt) is not an error.
  if (reason === "aborted") console.info(code, details);
  else console.error(code, details);
  return fail(code);
}

export async function runStructured<SCHEMA extends z.ZodType>(
  target: ModelTarget,
  request: StructuredRequest<SCHEMA>,
  signal: AbortSignal,
  limits: Limits = defaultLimits,
): Promise<Result<z.infer<SCHEMA>>> {
  if (signal.aborted) return failWith("ai_unavailable", "aborted");
  const started = performance.now();
  const total = AbortSignal.any([signal, AbortSignal.timeout(limits.totalMs)]);
  /** Why the run stopped when one of its signals fired. */
  const stopReason = (): Reason => (signal.aborted ? "aborted" : "timeout");

  if (target.healthCheck) {
    const healthSignal = AbortSignal.any([total, AbortSignal.timeout(limits.healthMs)]);
    const health = await target.healthCheck(healthSignal).catch((): HealthResult => "unreachable");
    if (health !== "ok") {
      if (total.aborted) return failWith("ai_unavailable", stopReason());
      return failWith("ai_unavailable", health === "model_not_loaded" ? "model_not_loaded" : "health");
    }
  }

  const { providerOptions: samplingOptions, ...sampling } = request.sampling ?? {};
  const providerOptions = mergeProviderOptions(target.providerOptions, samplingOptions);

  let feedback: ModelMessage | undefined;
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt++) {
    if (total.aborted) break;
    // Too little time left for another full answer: report the invalid one now.
    if (attempt > 1 && limits.totalMs - (performance.now() - started) < limits.minRetryMs) break;
    const attemptSignal = AbortSignal.any([total, AbortSignal.timeout(limits.attemptMs)]);
    try {
      const result = await generateText({
        model: target.model,
        system: request.system,
        messages: feedback ? [...request.messages, feedback] : request.messages,
        output: Output.object({ schema: request.schema }),
        providerOptions,
        maxOutputTokens: request.maxOutputTokens,
        ...sampling,
        ...(attempt > 1 && sampling.temperature === 0 ? { temperature: retryTemperature } : {}),
        // The port decides about new attempts; the SDK never retries on its own.
        maxRetries: 0,
        abortSignal: attemptSignal,
      });
      if (result.finishReason === "length") request.onTruncated?.();
      return ok(result.output as z.infer<SCHEMA>);
    } catch (error) {
      if (attemptSignal.aborted) return failWith("ai_unavailable", stopReason());
      if (NoObjectGeneratedError.isInstance(error) && error.finishReason === "length") request.onTruncated?.();
      if (APICallError.isInstance(error)) {
        const status = error.statusCode;
        // The provider refused this request (bad key, rate limit, too long, unknown model).
        if (status !== undefined && status >= 400 && status < 500) return failWith("ai_rejected", "rejected", status);
        // Network errors, HTTP 5xx and response bodies that are not JSON (e.g. an HTML error page).
        return failWith("ai_unavailable", "connection", status);
      }
      if (!isInvalidAnswer(error)) return failWith("ai_unavailable", "connection");
      // The model answered, but not as the schema says: tell it what was wrong and try again.
      feedback = { role: "user", content: schemaFeedback(error) };
    }
  }

  if (total.aborted) return failWith("ai_unavailable", stopReason());
  return failWith("ai_invalid", "invalid");
}

/** What a warm-up came to: the model answered, or it could not be reached in time. */
export type WarmUpResult = "ok" | "unavailable";

export type WarmUpRequest = {
  system: string;
  messages: ModelMessage[];
  /** The flow's own sampling, so the warm-up is as close to the real call as it can be. */
  sampling?: Sampling;
};

/** Story 12.2: the health check's usual 5 s, and at most 30 s for the whole warm-up. */
export const warmUpLimits = { healthMs: 5_000, totalMs: 30_000 } as const;

/**
 * A warm-up (Story 12.2, AD-9): the health check, then one call with the
 * flow's system prompt and a minimal message, for a single token, without a
 * schema and without new attempts. The answer is never read. Nothing is
 * logged here; the caller logs the result.
 */
export async function runWarmUp(
  target: ModelTarget,
  request: WarmUpRequest,
  signal: AbortSignal,
  limits: { healthMs: number; totalMs: number } = warmUpLimits,
): Promise<WarmUpResult> {
  if (signal.aborted) return "unavailable";
  const total = AbortSignal.any([signal, AbortSignal.timeout(limits.totalMs)]);
  if (target.healthCheck) {
    const healthSignal = AbortSignal.any([total, AbortSignal.timeout(limits.healthMs)]);
    const health = await target.healthCheck(healthSignal).catch((): HealthResult => "unreachable");
    if (health !== "ok") return "unavailable";
  }
  const { providerOptions: samplingOptions, ...sampling } = request.sampling ?? {};
  try {
    await generateText({
      model: target.model,
      system: request.system,
      messages: request.messages,
      // The same options as a real call: LM Studio's thinking stays off.
      providerOptions: mergeProviderOptions(target.providerOptions, samplingOptions),
      ...sampling,
      maxOutputTokens: 1,
      maxRetries: 0,
      abortSignal: total,
    });
    return "ok";
  } catch {
    return "unavailable";
  }
}

/** The target's provider options with the call's added, per provider (the call's win on the same key). */
export function mergeProviderOptions(
  base: ProviderOptions | undefined,
  extra: ProviderOptions | undefined,
): ProviderOptions | undefined {
  if (!extra) return base;
  const merged: ProviderOptions = { ...base };
  for (const [provider, options] of Object.entries(extra)) merged[provider] = { ...merged[provider], ...options };
  return merged;
}

/** The model answered, but its text is not JSON matching the schema. */
function isInvalidAnswer(error: unknown): boolean {
  return NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error);
}

type Issue = { path?: readonly unknown[]; message: string };

/**
 * A follow-up message for the next attempt: where the answer broke the schema
 * and why, from the validation issues. Paths and messages only, never values.
 */
export function schemaFeedback(error: unknown): string {
  const issues = findIssues(error);
  if (issues.length === 0) {
    return "Ditt förra svar var inte giltig JSON enligt schemat. Svara igen med bara JSON enligt schemat.";
  }
  const lines = issues.slice(0, 20).map((issue) => `- ${formatPath(issue.path)}: ${issue.message}`);
  return [
    "Ditt förra svar följde inte schemat:",
    ...lines,
    "Svara igen med hela svaret som JSON enligt schemat och rätta de här felen.",
  ].join("\n");
}

function findIssues(error: unknown): Issue[] {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const issues = (current as { issues?: unknown }).issues;
    if (Array.isArray(issues)) {
      return issues.filter(
        (issue): issue is Issue => typeof issue === "object" && issue !== null && typeof issue.message === "string",
      );
    }
    current = (current as { cause?: unknown }).cause;
  }
  return [];
}

function formatPath(path: readonly unknown[] | undefined): string {
  if (!path || path.length === 0) return "(rot)";
  return path
    .map((segment) =>
      typeof segment === "object" && segment !== null && "key" in segment ? String(segment.key) : String(segment),
    )
    .join(".");
}
