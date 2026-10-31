// No duplicates when cards overlap (Story 18.6): a thing seen on several cards
// of one room is a row per card; the later rows point at the kept one
// (thing_item.same_as), so lists, search, the question and the counts take
// only the kept rows and say "syns på 2 kort". Cards of different rooms are
// never compared, and a box's things are not the room's. Pure.

/** A thing as the comparison reads it: its id (for the rows) and the text the model sees. */
export type MergeCandidate = { id: string; name: string; category: string; where: string | null };

/** "syns på 2 kort", or nothing for a thing on one card. */
export function seenOnText(cards: number): string | null {
  return cards > 1 ? `syns på ${cards} kort` : null;
}
