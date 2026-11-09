// "Ikväll": the dishes starred on this phone to compare, kept for the session only (no history).

export type TonightPick = {
  /** Restaurant and dish name together: the same dish starred twice is one pick. */
  id: string;
  name: string;
  explanation: string;
  restaurant: string | null;
  /** Approximate kronor, or null when the dish has no price. */
  sek: number | null;
};

export function pickId(restaurant: string | null, name: string): string {
  return `${restaurant ?? ""}|${name}`;
}

/** The picks with `pick` added, or taken away when it is there already. */
export function togglePick(picks: readonly TonightPick[], pick: TonightPick): TonightPick[] {
  return picks.some((entry) => entry.id === pick.id) ? picks.filter((entry) => entry.id !== pick.id) : [...picks, pick];
}

export type TonightSummary = { count: number; totalSek: number; unpriced: number };

/** How many dishes, the sum of the priced ones in kronor, and how many have no price to add. */
export function summarizePicks(picks: readonly TonightPick[]): TonightSummary {
  let totalSek = 0;
  let unpriced = 0;
  for (const pick of picks) {
    if (pick.sek === null) unpriced += 1;
    else totalSek += pick.sek;
  }
  return { count: picks.length, totalSek, unpriced };
}

/** Picks from stored text; anything that is not a list of picks gives none. */
export function parsePicks(text: string | null): TonightPick[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is TonightPick =>
        typeof entry === "object" &&
        entry !== null &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.explanation === "string" &&
        (entry.restaurant === null || typeof entry.restaurant === "string") &&
        (entry.sek === null || (typeof entry.sek === "number" && Number.isFinite(entry.sek))),
    );
  } catch {
    return [];
  }
}
