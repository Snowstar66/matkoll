import "server-only";
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  streamText,
  type LanguageModel,
  type ModelMessage,
} from "ai";
import type { z } from "zod";
import { fail, ok, type Result } from "@/lib/errors";
import { estimateInputTokens, writtenTokens } from "./estimate";
import { holdUsage, tokenCount, type AiUsage } from "./usage";

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
   * Kylfoto A: provider options for the fridge photo's reading (analyzeImage)
   * only, over the target's own. Unset in the app since 2026-11-04; the eval
   * sets it to measure the fast mode (photoReadingOptionsFor).
   */
  photoReadingOptions?: ProviderOptions;
  /**
   * Kylfoto C: the model's answer can be read while it is written (streamText
   * with partial output). Set for the cloud adapters; without it a request
   * that asks for streaming (StructuredRequest.stream) is answered as one,
   * as before (LM Studio and local models).
   */
  streaming?: boolean;
  /** Tokens added to every call's maxOutputTokens, for a model whose thinking counts against it (Claude, Story 17.5). */
  extraOutputTokens?: number;
  /**
   * Story 12.2: the model runs on Pontus's Mac and goes cold after some
   * minutes without calls, so warmUp is worth a call. The key names the
   * model (LM Studio's model id), so the limit on warm-ups is one per user
   * and model, whatever the kind. Without it, warmUp does nothing: a cloud
   * model is never cold for us, and a call costs money.
   */
  warmUpKey?: string;
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
  /**
   * Kylfoto C: read the answer while the model writes it, on a target that
   * can (ModelTarget.streaming). `onPartial` gets the answer as far as it is
   * written (parsed, not validated, so each part is checked by the caller);
   * `read` turns the finished answer into the result, or `undefined` when
   * nothing in it can be used, which is an invalid answer (a new attempt).
   * The answer is not validated as a whole against `schema` then: the caller
   * validates each part on its own. Without streaming support the request is
   * an ordinary one, and `schema` validates the whole answer.
   */
  stream?: {
    onPartial: (partial: unknown) => void;
    read: (answer: unknown) => z.infer<SCHEMA> | undefined;
  };
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

/** The model id of a target, for the usage record. */
function modelIdOf(target: ModelTarget): string {
  return typeof target.model === "string" ? target.model : target.model.modelId;
}

/** Tokens spent so far by one run, over all its attempts (a refused answer costs too). */
type Tally = { calls: number; inputTokens: number; outputTokens: number };

/**
 * One attempt's tokens until the provider says: what it sends (estimated before it starts) and what
 * it has written so far (a streamed answer). Counted once, by `count` with the provider's usage, or
 * at the estimate when the attempt ends without one (security review S-01).
 */
type AttemptMeter = { inputTokens: number; outputTokens: number; counted: boolean };

/** The most one attempt writes when the call sets no limit. */
const defaultMaxOutputTokens = 8_000;

/** Where a run keeps the way to record what it used, once its reservation is made. */
type RunMeter = { finish?: (usage: readonly AiUsage[]) => Promise<void> };

export async function runStructured<SCHEMA extends z.ZodType>(
  target: ModelTarget,
  request: StructuredRequest<SCHEMA>,
  signal: AbortSignal,
  limits: Limits = defaultLimits,
): Promise<Result<z.infer<SCHEMA>>> {
  const tally: Tally = { calls: 0, inputTokens: 0, outputTokens: 0 };
  const run: RunMeter = {};
  try {
    return await runStructuredCounting(target, request, signal, limits, tally, run);
  } finally {
    // Story 17.6: one record per run, when the model was asked at all; S-01: also when the run was
    // aborted, timed out or failed, at an estimate for the attempts the provider did not report.
    // No attempt (stopped before the first) releases the reservation.
    const usage = tally.calls > 0 ? [{ model: modelIdOf(target), inputTokens: tally.inputTokens, outputTokens: tally.outputTokens }] : [];
    await run.finish?.(usage);
  }
}

/**
 * The worst case of a run, reserved against the household's cap before the first attempt (S-02):
 * every attempt it may make, each sending the request and writing up to its limit.
 */
function worstCase<SCHEMA extends z.ZodType>(target: ModelTarget, request: StructuredRequest<SCHEMA>, limits: Limits): AiUsage {
  const attempts = Math.max(1, limits.maxAttempts);
  const input = estimateInputTokens(request.system, request.messages, request.schema);
  const output = (request.maxOutputTokens ?? defaultMaxOutputTokens) + (target.extraOutputTokens ?? 0);
  return { model: modelIdOf(target), inputTokens: input * attempts, outputTokens: output * attempts };
}

async function runStructuredCounting<SCHEMA extends z.ZodType>(
  target: ModelTarget,
  request: StructuredRequest<SCHEMA>,
  signal: AbortSignal,
  limits: Limits,
  tally: Tally,
  run: RunMeter,
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

  // Tak för AI-kostnad (S-02): the run's worst case is reserved before the model is asked, so
  // parallel calls of a household see each other; refused at the cap, or when it cannot be checked.
  const held = await holdUsage([worstCase(target, request, limits)]);
  if (!held.ok) {
    console.info(held.code);
    return fail(held.code);
  }
  run.finish = held.finish;

  const { providerOptions: samplingOptions, ...sampling } = request.sampling ?? {};
  const providerOptions = mergeProviderOptions(target.providerOptions, samplingOptions);

  let feedback: ModelMessage | undefined;
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt++) {
    if (total.aborted) break;
    // Too little time left for another full answer: report the invalid one now.
    if (attempt > 1 && limits.totalMs - (performance.now() - started) < limits.minRetryMs) break;
    const attemptSignal = AbortSignal.any([total, AbortSignal.timeout(limits.attemptMs)]);
    const messages = feedback ? [...request.messages, feedback] : request.messages;
    const meter: AttemptMeter = { inputTokens: estimateInputTokens(request.system, messages, request.schema), outputTokens: 0, counted: false };
    try {
      if (request.stream && target.streaming) {
        const streamed = await streamAttempt(
          target,
          request,
          request.stream,
          { system: request.system, messages, providerOptions, sampling, attempt, attemptSignal },
          tally,
          meter,
        );
        if (streamed.kind === "answer") return ok(streamed.value);
        // The model answered, but nothing in the answer could be read: tell it and try again.
        feedback = { role: "user", content: schemaFeedback(undefined) };
        continue;
      }
      const result = await generateText({
        model: target.model,
        system: request.system,
        messages,
        output: Output.object({ schema: request.schema }),
        providerOptions,
        maxOutputTokens:
          request.maxOutputTokens === undefined ? undefined : request.maxOutputTokens + (target.extraOutputTokens ?? 0),
        ...sampling,
        ...(attempt > 1 && sampling.temperature === 0 ? { temperature: retryTemperature } : {}),
        // The port decides about new attempts; the SDK never retries on its own.
        maxRetries: 0,
        abortSignal: attemptSignal,
      });
      count(tally, meter, result.usage);
      if (result.finishReason === "length") request.onTruncated?.();
      return ok(result.output as z.infer<SCHEMA>);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) count(tally, meter, error.usage);
      // S-01: an attempt that ended without the provider's usage (aborted, timed out, a broken
      // connection, a 5xx) may still be billed: it counts at what it sent and wrote so far. A
      // refusal (HTTP 4xx) generated nothing and is not counted.
      if (!isRefusal(error)) count(tally, meter, undefined);
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

/** The provider refused the request (HTTP 4xx): nothing was generated, so nothing is billed. */
function isRefusal(error: unknown): boolean {
  if (!APICallError.isInstance(error)) return false;
  const status = error.statusCode;
  return status !== undefined && status >= 400 && status < 500;
}

type StreamAttemptInput = {
  system: string;
  messages: ModelMessage[];
  providerOptions: ProviderOptions | undefined;
  sampling: Omit<Sampling, "providerOptions">;
  attempt: number;
  attemptSignal: AbortSignal;
};

/**
 * Kylfoto C: one attempt that reads the answer while it is written
 * (streamText). The last partial answer is the whole one; `stream.read`
 * judges it. A failure of the stream (the provider's error, the network) is
 * thrown, so the loop above treats it as it does one of generateText.
 */
async function streamAttempt<SCHEMA extends z.ZodType>(
  target: ModelTarget,
  request: StructuredRequest<SCHEMA>,
  stream: NonNullable<StructuredRequest<SCHEMA>["stream"]>,
  input: StreamAttemptInput,
  tally: Tally,
  meter: AttemptMeter,
): Promise<{ kind: "answer"; value: z.infer<SCHEMA> } | { kind: "unreadable" }> {
  let streamError: unknown;
  const result = streamText({
    model: target.model,
    system: input.system,
    messages: input.messages,
    output: Output.object({ schema: request.schema }),
    providerOptions: input.providerOptions,
    maxOutputTokens:
      request.maxOutputTokens === undefined ? undefined : request.maxOutputTokens + (target.extraOutputTokens ?? 0),
    ...input.sampling,
    ...(input.attempt > 1 && input.sampling.temperature === 0 ? { temperature: retryTemperature } : {}),
    maxRetries: 0,
    abortSignal: input.attemptSignal,
    onError: ({ error }) => {
      streamError = error;
    },
  });
  let last: unknown;
  try {
    for await (const partial of result.partialOutputStream) {
      // Nothing is reported once the run is stopped.
      if (input.attemptSignal.aborted) break;
      last = partial;
      // S-01: what is written so far, in case the stream ends without the provider's usage.
      meter.outputTokens = writtenTokens(partial);
      stream.onPartial(partial);
    }
  } catch (error) {
    streamError ??= error;
  }
  if (streamError !== undefined) throw streamError;
  if (input.attemptSignal.aborted) throw new Error("aborted");
  const usage = await Promise.resolve(result.usage).catch(() => undefined);
  count(tally, meter, usage);
  const finishReason = await Promise.resolve(result.finishReason).catch(() => undefined);
  if (finishReason === "length") request.onTruncated?.();
  const value = stream.read(last);
  return value === undefined ? { kind: "unreadable" } : { kind: "answer", value };
}

/**
 * Adds one attempt's usage, once: the provider's figures, or (when it gave none, S-01) the
 * attempt's estimate of what it sent and wrote so far. A figure the provider left out is estimated.
 */
function count(
  tally: Tally,
  meter: AttemptMeter,
  usage: { inputTokens: number | undefined; outputTokens: number | undefined } | undefined,
): void {
  if (meter.counted) return;
  meter.counted = true;
  tally.calls += 1;
  tally.inputTokens += usage?.inputTokens === undefined ? meter.inputTokens : tokenCount(usage.inputTokens);
  tally.outputTokens += usage?.outputTokens === undefined ? meter.outputTokens : tokenCount(usage.outputTokens);
}

/**
 * What a warm-up came to (Story 12.2): the model answered (`ok`); it was
 * not needed (`skipped`: within the limit, an AI call of the user's on its
 * way, or a provider that is never cold); or the model could not be reached
 * (`unavailable`: the health check failed, the model is not loaded, the
 * budget ran out, or the call failed). Logged as `ai_warm` with the reason,
 * never with a prompt or an answer.
 */
export type WarmUpResult =
  | { outcome: "ok" }
  | { outcome: "skipped"; reason: "limited" | "busy" | "provider" }
  | { outcome: "unavailable"; reason: "health" | "model_not_loaded" | "timeout" | "connection" };

export type WarmUpRequest = {
  system: string;
  messages: ModelMessage[];
  /** The flow's own sampling, so the warm-up is as close to the real call as it can be. */
  sampling?: Sampling;
};

export type WarmUpOptions = {
  /**
   * Asked again after the health check, just before the model is called:
   * true when a real AI call of the user's started in the meantime, which
   * the warm-up then never delays. May ask the database (Story 12.4: an AI
   * job of the user's that is queued or running).
   */
  isBusy?: () => boolean | Promise<boolean>;
};

/**
 * Story 12.2: the health check's usual 5 s, and at most 50 s for the whole
 * warm-up, within POST /api/ai/warm's maxDuration of 60 s. A cold call
 * spends most of its time before the first token (12.1: 38-86 s for a
 * photo, against 20 s warm), so a shorter budget would often stop the
 * warm-up before it has woken the model.
 */
export const warmUpLimits = { healthMs: 5_000, totalMs: 50_000 } as const;

/**
 * A warm-up (Story 12.2, AD-9): the health check, then (unless isBusy says
 * a real call has started) one call with the flow's system prompt and a
 * minimal message, for a single token, without a schema and without new
 * attempts. The answer is never read. Nothing is logged here; the caller
 * logs the result.
 */
export async function runWarmUp(
  target: ModelTarget,
  request: WarmUpRequest,
  signal: AbortSignal,
  { isBusy }: WarmUpOptions = {},
  limits: { healthMs: number; totalMs: number } = warmUpLimits,
): Promise<WarmUpResult> {
  if (signal.aborted) return { outcome: "unavailable", reason: "timeout" };
  const total = AbortSignal.any([signal, AbortSignal.timeout(limits.totalMs)]);
  if (target.healthCheck) {
    const healthSignal = AbortSignal.any([total, AbortSignal.timeout(limits.healthMs)]);
    const health = await target.healthCheck(healthSignal).catch((): HealthResult => "unreachable");
    if (health !== "ok") {
      if (total.aborted) return { outcome: "unavailable", reason: "timeout" };
      return { outcome: "unavailable", reason: health === "model_not_loaded" ? "model_not_loaded" : "health" };
    }
  }
  if (await isBusy?.()) return { outcome: "skipped", reason: "busy" };
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
    return { outcome: "ok" };
  } catch {
    return { outcome: "unavailable", reason: total.aborted ? "timeout" : "connection" };
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

/** `sampling` with `extra` added to its provider options (extra's win on the same key). */
export function withProviderOptions(sampling: Sampling | undefined, extra: ProviderOptions | undefined): Sampling | undefined {
  if (!extra) return sampling;
  return { ...sampling, providerOptions: mergeProviderOptions(sampling?.providerOptions, extra) };
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
