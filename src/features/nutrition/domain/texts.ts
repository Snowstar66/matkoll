import type { UncountedLine } from "./recipe-nutrition";
import type { KostradTag, PlateShares, WeekSummary } from "./kostrad";

// The words of the nutrition UI, kept apart from the components so they can be tested.

/** What a tag means, in a few words (the sheet's "Märken" card). */
export const KOSTRAD_TAG_EXPLANATIONS: Record<KostradTag, string> = {
  "Mycket grönt": "Mer än halva tallriken är grönsaker.",
  Fisk: "Rätten har en riktig portion fisk eller skaldjur.",
  Baljväxter: "Rätten har bönor, linser eller ärtor.",
  Fullkorn: "Det mesta av det som är kolhydrater är fullkorn.",
};

/** A share 0..1 as "ca 70 %", rounded to the nearest 5 % so it never looks exact. */
export function shareText(share: number): string {
  return `ca ${Math.round((share * 100) / 5) * 5} %`;
}

export const PLATE_PARTS = [
  { key: "gronsaker", label: "Grönsaker", legend: "Grönt" },
  { key: "protein", label: "Protein", legend: "Protein" },
  { key: "kolhydrater", label: "Kolhydrater", legend: "Kolhydrater" },
] as const satisfies readonly { key: keyof PlateShares; label: string; legend: string }[];

/**
 * "Veckans middagar: 2 fiskrätter · 3 gröna", with the parts that are zero left
 * out ("1 fiskrätt", "1 grön"); `null` when there is nothing to say.
 */
export function weekLineText(summary: WeekSummary): string | null {
  const parts: string[] = [];
  if (summary.fishDishes > 0) parts.push(summary.fishDishes === 1 ? "1 fiskrätt" : `${summary.fishDishes} fiskrätter`);
  if (summary.greenDishes > 0) parts.push(summary.greenDishes === 1 ? "1 grön" : `${summary.greenDishes} gröna`);
  return parts.length > 0 ? `Veckans middagar: ${parts.join(" · ")}` : null;
}

/** "Räknat på 9 av 11 varor." */
export function coverageText(counted: number, total: number): string {
  return `Räknat på ${counted} av ${total} varor.`;
}

export const KCAL_UNSURE_TEXT = "kcal går inte att räkna säkert för det här receptet.";

/** "Räknas inte: fransyska (okänd vara), crème fraiche (1 förp, okänd storlek)"; `null` when all were counted. */
export function uncountedText(uncounted: readonly UncountedLine[]): string | null {
  if (uncounted.length === 0) return null;
  const parts = uncounted.map((line) => {
    if (line.reason === "unknown_ingredient") return `${line.label} (okänd vara)`;
    return line.label.endsWith(")") ? `${line.label.slice(0, -1)}, okänd storlek)` : `${line.label} (okänd storlek)`;
  });
  return `Räknas inte: ${parts.join(", ")}.`;
}
