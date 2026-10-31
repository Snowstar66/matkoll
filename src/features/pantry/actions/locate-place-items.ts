import "server-only";
import { getAiServiceForUser } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import type { ImageInput } from "@/server/ai";
import type { LocateResult } from "../domain/photo-numbers";

// The second step of a photo's AI job (Story 6.6, 12.5, AD-2, AD-9, AD-15):
// "Nummer på fotot", after the reading of the same photo. Not a Server
// Action: the Route Handler /api/ai/jobs/photo calls it in the job's
// background with the photo still in the request's memory and the labels of
// the reading. It never writes and never reads the database. The photo is only
// passed on to the AI port; it is never stored or logged, and neither are
// the labels or the points. Only codes and counts are logged.

export type LocatePlaceItemsInput = {
  /** The same resized photo the reading was made from. */
  image: ImageInput;
  /** The reading: the items in reading order, one-line labels (locateLabelsSchema). */
  labels: string[];
};

export type LocatePlaceItemsOptions = {
  /** The job's signal: the job was cancelled or replaced. */
  signal: AbortSignal;
  /** When the lookup must be done (Date.now() milliseconds). */
  deadline?: number;
};

/**
 * The points of the items on the photo, by their number in the reading: the
 * AI port's locateItems (`validation`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`). A job that is stopped is `ai_unavailable`. Never writes
 * (AD-2).
 */
export async function locatePlaceItems(
  input: LocatePlaceItemsInput,
  { signal, deadline }: LocatePlaceItemsOptions,
): Promise<Result<LocateResult>> {
  const located = await (await getAiServiceForUser()).locateItems(input, signal, { deadline });
  if (!located.ok) return located;
  if (signal.aborted) {
    console.info("locate_aborted");
    return fail("ai_unavailable");
  }
  const { positions } = located.data;
  if (positions.length < input.labels.length) {
    console.info("locate_positions_missing", { count: input.labels.length - positions.length });
  }
  return ok({ positions });
}
