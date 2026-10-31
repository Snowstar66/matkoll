import { cleanModelText } from "@/lib/suggest-input";
import { inputLimits, mergeThingsText, type MergeThingsInput } from "@/server/ai";
import type { MergeCandidate } from "../domain/thing-merge";

// What goes to the AI to merge a new card's things with the room's other cards
// (Story 18.6), and what its answer turns into. Text only, never an image.

/** What the model is asked, and the ids its numbers stand for (the n-th line is `existingIds[n - 1]`, and likewise for the new card). */
export type MergeRequest = { input: MergeThingsInput; addedIds: string[]; existingIds: string[] };

/**
 * The comparison of a new card with the room's other cards, or `null` when
 * there is nothing to compare (no thing on the card, none on the others). Texts
 * are cleaned to one line like for any model input; a thing with no name left
 * is left out. The lists are cut to inputLimits.merge, the room's oldest kept
 * things first.
 */
export function buildMergeRequest(
  room: string,
  addedCard: string,
  added: readonly MergeCandidate[],
  existing: readonly (MergeCandidate & { card: string })[],
): MergeRequest | null {
  const { maxAdded, maxExisting } = inputLimits.merge;
  const clean = (candidate: MergeCandidate) => {
    const name = cleanModelText(candidate.name);
    const where = candidate.where ? cleanModelText(candidate.where) : "";
    return name === "" ? null : { id: candidate.id, name, category: cleanModelText(candidate.category) || "Övrigt", where: where === "" ? null : where };
  };
  const newThings = added.flatMap((thing) => clean(thing) ?? []).slice(0, maxAdded);
  const oldThings = existing
    .flatMap((thing) => {
      const cleaned = clean(thing);
      return cleaned ? [{ ...cleaned, card: cleanModelText(thing.card) || "Kort" }] : [];
    })
    .slice(0, maxExisting);
  if (newThings.length === 0 || oldThings.length === 0) return null;
  const request: MergeRequest = {
    input: {
      room: cleanModelText(room) || "Rum",
      existing: oldThings.map(({ name, category, where, card }) => ({ name, category, where, card })),
      addedCard: cleanModelText(addedCard) || "Nytt kort",
      added: newThings.map(({ name, category, where }) => ({ name, category, where })),
    },
    addedIds: newThings.map((thing) => thing.id),
    existingIds: oldThings.map((thing) => thing.id),
  };
  // A room with very many things: the last kept things are left out until the text fits, so the call is never refused for its size.
  while (request.input.existing.length > 1 && mergeThingsText(request.input).length > inputLimits.merge.maxChars) {
    request.input.existing.pop();
    request.existingIds.pop();
  }
  return request;
}

/** The model's pairs (zero-based indexes) as the rows merge_thing_items takes. */
export function mergeRows(request: Pick<MergeRequest, "addedIds" | "existingIds">, pairs: readonly { added: number; existing: number }[]): { item: string; target: string }[] {
  return pairs.flatMap(({ added, existing }) => {
    const item = request.addedIds[added];
    const target = request.existingIds[existing];
    return item && target ? [{ item, target }] : [];
  });
}
