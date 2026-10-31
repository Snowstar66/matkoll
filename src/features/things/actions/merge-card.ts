import "server-only";
import type { AiService } from "@/server/ai/service";
import { ThingsDataError, type ThingsDb } from "../data/client";
import { loadMergeInputIn, mergeItemsIn } from "../data/merge";
import { buildMergeRequest, mergeRows } from "./merge-input";

// The overlap merge (Story 18.6, FR-24, AD-9): when a card is done, its things
// are compared with the kept things of the room's other cards in one text call
// (no image) through the user's AI choice, and the ones that are the same
// thing are merged. It only ever improves the lists: a call that fails, or
// runs out of time, leaves the card as it was (every thing counted once on
// its own card) and is only logged, never turns the finished card into a
// failed one. Only counts and codes are logged, never a name.

/**
 * Compares the finished card `photoId` with its room and merges what is the
 * same. Returns how many things were merged; 0 when there was nothing to
 * compare, the call did not go or nothing matched. Never throws for Supabase
 * or the model.
 */
export async function mergeCardWithRoom(
  db: ThingsDb,
  ai: Pick<AiService, "mergeThings">,
  photoId: string,
  signal: AbortSignal,
  deadline: number,
): Promise<number> {
  try {
    const rows = await loadMergeInputIn(db, photoId);
    const request = rows && buildMergeRequest(rows.room, rows.cardTitle, rows.added, rows.existing);
    if (!request) return 0;
    const answered = await ai.mergeThings(request.input, signal, { deadline });
    if (!answered.ok) {
      console.error("things_merge_failed", { reason: answered.error.code });
      return 0;
    }
    const merges = mergeRows(request, answered.data.pairs);
    if (merges.length === 0) return 0;
    const merged = await mergeItemsIn(db, photoId, merges);
    console.info("things_merged", { asked: request.input.added.length, compared: request.input.existing.length, merged });
    return merged;
  } catch (error) {
    console.error("things_merge_failed", { reason: error instanceof ThingsDataError ? error.detail : "unknown" });
    return 0;
  }
}
