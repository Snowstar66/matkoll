// Kylfoto A: the `analyze_timing` log of a photo's job, so the time from the
// photo to the cards can be told apart per step: the client's resize, the
// upload (the server reading the form), the wait for the job's turn, the
// model, and the matching and the place after it. Only whole milliseconds,
// the photo's longest side and bytes, and a code: never an item, a name, a
// place or the photo.

/** The longest a client-measured step can be and still be logged (a minute); anything else is left out. */
const maxClientMs = 60_000;

/** A time the client measured (the form field `downscaleMs`), as whole milliseconds, or `undefined` when it is not one. */
export function clientMs(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || !/^\d{1,6}$/.test(value)) return undefined;
  const ms = Number(value);
  return ms <= maxClientMs ? ms : undefined;
}

export type AnalyzeTiming = {
  /** The client's resize of the photo, when it said. */
  downscaleMs?: number;
  /** From the request's start until the form with the photo was read. */
  uploadMs: number;
  /** From the form until the job started (the checks, the queue and its turn). */
  queueMs?: number;
  /** The AI port's reading of the photo. */
  modelMs?: number;
  /** From the model's answer to the reading (matching, names, the place). */
  postMs?: number;
  /** From the request's start until the cards were there, or the job failed. */
  totalMs?: number;
  /** The photo's longest side in pixels, and its size in bytes. */
  side: number;
  bytes: number;
  /** `ok`, or the error code the job ended with. */
  outcome: string;
};

/** Logs one photo's timing; the fields left out were not reached. */
export function logAnalyzeTiming(timing: AnalyzeTiming): void {
  const fields = Object.fromEntries(Object.entries(timing).filter(([, value]) => value !== undefined));
  console.info("analyze_timing", fields);
}
