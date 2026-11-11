// How old a waiting proposal may be before the card stops offering it as current. Pure: the caller passes the
// server's clock (never the device's), so two phones with different clocks agree.

/** A draft is "fresh" for 24 hours after it was made. */
export const draftMaxAgeMs = 24 * 60 * 60 * 1000;

export type DraftFreshness = "fresh" | "old";

/** `createdAt` is the row's created_at (ISO). Exactly 24 h is old; a time that cannot be read, or one in the future by more than a minute, counts as old. */
export function draftFreshness(createdAt: string, now: Date): DraftFreshness {
  const made = Date.parse(createdAt);
  if (!Number.isFinite(made) || !Number.isFinite(now.getTime())) return "old";
  const age = now.getTime() - made;
  return age >= 0 && age < draftMaxAgeMs ? "fresh" : age < 0 && age > -60_000 ? "fresh" : "old";
}

/**
 * The draft the proposal screen opens with: the waiting one while it is fresh, unless the address asks for a redo
 * (?gor-om) or a new proposal (?nytt). An old draft is never shown as current.
 */
export function draftToShow<T extends { createdAt: string }>(draft: T | null, now: Date, ask: { redo: boolean; fresh: boolean }): T | null {
  if (!draft || ask.redo || ask.fresh) return null;
  return draftFreshness(draft.createdAt, now) === "fresh" ? draft : null;
}
