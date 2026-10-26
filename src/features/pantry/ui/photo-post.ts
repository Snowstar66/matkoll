// Senaste foto (Story 10.1): the one call that sends a photo to be saved,
// POST /api/pantry/photo, as multipart/form-data. Its own module, so tests
// replace it. The answer says whether a later write may try again: no answer
// (no connection, the 60 s are up) and a server error may, a refusal (4xx,
// such as `validation` or `pantry_site_gone`) may not.

/** How long a save may take before the client gives up on its answer. */
export const photoPostTimeoutMs = 60_000;

export type PhotoPostAnswer =
  /** Saved (or not kept, as an older photo): the photo's id, for points that come later. */
  | { kind: "saved"; id: string }
  /** No answer, or a server error: one more try is allowed. */
  | { kind: "retry" }
  /** Refused, or an answer that is not the Result shape: never tried again. */
  | { kind: "final" };

/** Posts the photo's form and reads what came back. Never throws. */
export async function postPlacePhoto(form: FormData): Promise<PhotoPostAnswer> {
  let response: Response;
  try {
    response = await fetch("/api/pantry/photo", {
      method: "POST",
      headers: { accept: "application/json" },
      body: form,
      // Nothing else stops it: a new photo, "Avbryt" or Hemma hidden leave it be.
      signal: AbortSignal.timeout(photoPostTimeoutMs),
    });
  } catch {
    return { kind: "retry" };
  }
  if (response.status >= 500) {
    await response.body?.cancel().catch(() => {});
    return { kind: "retry" };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { kind: "final" };
  }
  if (!response.ok || typeof payload !== "object" || payload === null) return { kind: "final" };
  const answer = payload as { ok?: unknown; data?: { id?: unknown } | null };
  return answer.ok === true && typeof answer.data?.id === "string" ? { kind: "saved", id: answer.data.id } : { kind: "final" };
}
