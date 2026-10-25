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

/** A configured model from one of the adapters. */
export type ModelTarget = {
  model: LanguageModel;
  providerOptions?: ProviderOptions;
  /** Checks that the model server answers and has the model; called before the first attempt. */
  healthCheck?: (signal: AbortSignal) => Promise<HealthResult>;
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
};

export const defaultLimits: Limits = {
  healthMs: 5_000,
  attemptMs: 45_000,
  totalMs: 110_000,
  maxAttempts: 3,
};

export type StructuredRequest<SCHEMA extends z.ZodType> = {
  schema: SCHEMA;
  system: string;
  messages: ModelMessage[];
  maxOutputTokens?: number;
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

  let feedback: ModelMessage | undefined;
  for (let attempt = 1; attempt <= limits.maxAttempts; attempt++) {
    if (total.aborted) break;
    const attemptSignal = AbortSignal.any([total, AbortSignal.timeout(limits.attemptMs)]);
    try {
      const result = await generateText({
        model: target.model,
        system: request.system,
        messages: feedback ? [...request.messages, feedback] : request.messages,
        output: Output.object({ schema: request.schema }),
        providerOptions: target.providerOptions,
        maxOutputTokens: request.maxOutputTokens,
        // The port decides about new attempts; the SDK never retries on its own.
        maxRetries: 0,
        abortSignal: attemptSignal,
      });
      return ok(result.output as z.infer<SCHEMA>);
    } catch (error) {
      if (attemptSignal.aborted) return failWith("ai_unavailable", stopReason());
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
