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

/** What warmAi can wake (Story 12.2): the reading of a photo, or the text flows. */
export type WarmAiKind = "image" | "text";

/** The client asks for the same kind at most once in this time, as the server allows. */
export const warmAiIntervalMs = 5 * 60_000;

/** The sessionStorage key with when `kind` was last asked for (Date.now()). */
export const warmAiKey = (kind: WarmAiKind) => `matkoll.warmAi.${kind}`;

function lastWarmAi(kind: WarmAiKind): number | null {
  try {
    const value = Number(window.sessionStorage.getItem(warmAiKey(kind)));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberWarmAi(kind: WarmAiKind, at: number): void {
  try {
    window.sessionStorage.setItem(warmAiKey(kind), String(at));
  } catch {
    // No storage (private mode, blocked): the server's own limit still holds.
  }
}

/**
 * Asks the server to wake the model before it is needed (Story 12.2,
 * FR-45): POST /api/ai/warm with `kind`, at most once per kind in
 * warmAiIntervalMs per browser tab (sessionStorage). Fire and forget: the
 * answer and any error are ignored, and nothing is ever shown.
 */
export function warmAi(kind: WarmAiKind, now: number = Date.now()): void {
  const last = lastWarmAi(kind);
  // A time in the future (a clock set back) does not hold the warm-up off.
  if (last !== null && now >= last && now - last < warmAiIntervalMs) return;
  rememberWarmAi(kind, now);
  try {
    fetch("/api/ai/warm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind }),
    }).catch(() => {});
  } catch {
    // fetch threw before sending: nothing to wake, and nothing to show.
  }
}
