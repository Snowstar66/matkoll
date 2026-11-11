import type { Suggestion, WarningFlag } from "./types";

// Puts the screen's suggestions together from the guarded picks, in the model's order, up to `maxSuggestions`. Pure.

export const maxSuggestions = 5;
/** Longest menu text handed over to the Menyrådgivare, in characters. */
export const maxMenuTextChars = 8000;

export type SuggestionViewData = {
  id: string;
  name: string;
  area: string | null;
  website: string | null;
  why: { text: string; sourceUrl: string }[];
  menuStatus: "found" | "missing";
  menuText: string | null;
  address: { text: string; sourceUrl: string } | null;
  hours: { text: string; sourceUrl: string } | null;
  rating: { value: number; scale: number; count: number | null; sourceName: string; sourceUrl: string } | null;
  flags: string[];
};

/**
 * @param picks What the guard let through, in the model's order.
 * @param hasAllergies Whether anyone in the household has an allergy: a menu can never prove one safe, so every suggestion says so.
 */
export function assembleViews(picks: readonly Suggestion[], hasAllergies: boolean): SuggestionViewData[] {
  return picks.slice(0, maxSuggestions).map((pick) => {
    const flags = new Set<WarningFlag>(pick.warnings);
    if (pick.menuStatus === "missing") flags.add("menu_missing");
    // No source gave the opening hours: the card says so (the person must call and check).
    if (!pick.hours) flags.add("open_hours_unverified");
    if (hasAllergies) flags.add("allergy_unverified");
    return {
      id: pick.id,
      name: pick.name,
      area: pick.area,
      website: pick.website,
      why: pick.why,
      menuStatus: pick.menuStatus,
      menuText: pick.menu ? Array.from(pick.menu.text).slice(0, maxMenuTextChars).join("") : null,
      address: pick.address,
      hours: pick.hours,
      rating: pick.rating,
      flags: [...flags],
    };
  });
}
