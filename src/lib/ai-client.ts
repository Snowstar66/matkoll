import { fail, isErrorCode, ok, type Result } from "./errors";

// The client's way to the AI Route Handlers in src/app/api/ai/* (AD-9). AI is
// never called from Server Actions or during rendering; the client posts here,
// shows progress and can stop the call with its AbortSignal.

/** The caller stopped the call ("Avbryt"). Not an error: nothing is shown. */
export type AiAborted = { ok: false; aborted: true; error?: undefined };

export type AiCallResult<T> = Result<T> | AiAborted;

const aborted: AiAborted = { ok: false, aborted: true };

/** The handler's answer as a Result, with the Swedish text from errors.ts for its code. */
function toResult<T>(payload: unknown): Result<T> {
  if (typeof payload === "object" && payload !== null && "ok" in payload) {
    if (payload.ok === true && "data" in payload) return ok(payload.data as T);
    if (payload.ok === false && "error" in payload) {
      const error = payload.error as { code?: unknown; fields?: unknown } | null;
      if (isErrorCode(error?.code)) {
        const fields =
          typeof error.fields === "object" &&
          error.fields !== null &&
          Object.values(error.fields).every((value) => typeof value === "string")
            ? (error.fields as Record<string, string>)
            : undefined;
        return fail(error.code, fields);
      }
    }
  }
  return fail("ai_unavailable");
}

/**
 * Posts `body` as JSON to an AI Route Handler and returns its result. A
 * network error, or an answer that is not the Result shape (e.g. an HTML error
 * page), gives `ai_unavailable`. Aborting `signal` gives `{ aborted: true }`.
 */
export async function postAi<T>(path: string, body: unknown, signal: AbortSignal): Promise<AiCallResult<T>> {
  return post<T>(path, { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, signal);
}

/**
 * Posts `formData` as multipart/form-data, e.g. a photo, to an AI Route
 * Handler. Same result and abort as postAi. The browser sets the content type
 * with its boundary.
 */
export async function postAiForm<T>(path: string, formData: FormData, signal: AbortSignal): Promise<AiCallResult<T>> {
  return post<T>(path, { body: formData }, signal);
}

async function post<T>(
  path: string,
  { headers, body }: { headers?: Record<string, string>; body: BodyInit },
  signal: AbortSignal,
): Promise<AiCallResult<T>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { ...headers, accept: "application/json" },
      body,
      signal,
    });
    return toResult<T>(await response.json());
  } catch {
    return signal.aborted ? aborted : fail("ai_unavailable");
  }
}
