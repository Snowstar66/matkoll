import "server-only";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { getAiService, type ImageInput } from "@/server/ai";
import type { LocateResult } from "../domain/photo-numbers";
import { finishRun, startRun } from "./ai-runs";

// The server side of "Nummer på fotot" (Story 6.6, AD-2, AD-9, AD-15). Not a
// Server Action: the Route Handler /api/ai/locate calls it with the
// request's signal, after the cards from the same photo are shown. It never
// writes and never reads the database: the photo and the labels come from
// the client, which got the labels from /api/ai/analyze. The photo is only
// passed on to the AI port; it is never stored or logged, and neither are
// the labels or the points. Only codes and counts are logged.

export type LocatePlaceItemsInput = {
  /** The same resized photo the client sent for the analysis, checked by the Route Handler (AD-15). */
  image: ImageInput;
  /** The answer's `reading`: the items in reading order, one-line labels (locateLabelsSchema). */
  labels: string[];
};

export type LocatePlaceItemsOptions = {
  signal: AbortSignal;
  /** When the whole request must be done (Date.now() milliseconds). */
  deadline?: number;
};

/**
 * The points of the items on the photo, by their number in the reading. In
 * order: the user, the run lock (an analysis of the same user on its way
 * wins: `ai_superseded` at once; an older lookup is stopped), and the AI
 * port's locateItems (`validation`, `ai_unavailable`, `ai_rejected`,
 * `ai_invalid`). A request that goes away is `ai_unavailable`; one stopped
 * by a newer run of the same user is `ai_superseded`. Never writes (AD-2).
 */
export async function locatePlaceItems(
  input: LocatePlaceItemsInput,
  { signal, deadline }: LocatePlaceItemsOptions,
): Promise<Result<LocateResult>> {
  const user = await requireUser();
  if (!user.ok) return user;

  const own = startRun(user.data.id, "locate");
  if (!own) {
    console.info("locate_superseded", { reason: "analyzing" });
    return fail("ai_superseded");
  }
  try {
    const located = await getAiService().locateItems(input, AbortSignal.any([signal, own.signal]), { deadline });
    if (own.signal.aborted && !signal.aborted) {
      console.info("locate_superseded");
      return fail("ai_superseded");
    }
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
  } finally {
    finishRun(user.data.id, own);
  }
}
