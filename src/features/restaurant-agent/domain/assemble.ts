import type { MenuSource, PlaceFacts, Suggestion, WarningFlag } from "./types";

// Puts the screen's suggestions together: the guarded picks of the model first (its order), then the remaining ranked
// places without a menu, up to `maxSuggestions`. Pure. Google facts are copied to the view only (to the browser).

export const maxSuggestions = 5;
/** Longest menu text handed over to the Menyrådgivare, in characters. */
export const maxMenuTextChars = 8000;

export type PlaceEntry = { facts: PlaceFacts; distanceM: number | null };

export type SuggestionViewData = {
  placeId: string;
  name: string;
  address: string;
  distanceM: number | null;
  openNow: boolean | null;
  mapsUrl: string;
  why: { text: string; sourceUrl: string }[];
  menuStatus: "found" | "missing";
  menuText: string | null;
  flags: string[];
};

const menuTextOf = (placeId: string, sources: readonly MenuSource[]): string | null => {
  const text = sources.filter((source) => source.placeId === placeId && source.text.trim() !== "").map((source) => source.text.trim()).join("\n\n");
  return text === "" ? null : Array.from(text).slice(0, maxMenuTextChars).join("");
};

/**
 * @param rankedIds Every place of this run, best first by our own weighting.
 * @param picks What the guard let through, in the model's order; empty when the model was not used or failed.
 * @param hasAllergies Whether anyone in the household has an allergy: a menu can never prove one safe, so every found menu says so.
 */
export function assembleViews(rankedIds: readonly string[], places: ReadonlyMap<string, PlaceEntry>, picks: readonly Suggestion[], sources: readonly MenuSource[], hasAllergies: boolean): SuggestionViewData[] {
  const withMenu = new Set(sources.filter((source) => source.text.trim() !== "").map((source) => source.placeId));
  const order: Suggestion[] = [...picks];
  const taken = new Set(picks.map((pick) => pick.placeId));
  for (const placeId of rankedIds) {
    if (order.length >= maxSuggestions) break;
    if (taken.has(placeId)) continue;
    // Without the model, a place with a menu is still shown (no reasons); with it, only the places it left out for lack of a menu fill up.
    if (picks.length > 0 && withMenu.has(placeId)) continue;
    taken.add(placeId);
    order.push({ placeId, why: [], menuStatus: withMenu.has(placeId) ? "found" : "missing", warnings: [] });
  }
  return order.slice(0, maxSuggestions).flatMap((suggestion) => {
    const entry = places.get(suggestion.placeId);
    if (!entry) return [];
    const flags = new Set<WarningFlag>(suggestion.warnings);
    if (suggestion.menuStatus === "missing") flags.add("menu_missing");
    if (hasAllergies) flags.add("allergy_unverified");
    return [
      {
        placeId: suggestion.placeId,
        name: entry.facts.name,
        address: entry.facts.address,
        distanceM: entry.distanceM,
        openNow: entry.facts.openNow,
        mapsUrl: entry.facts.mapsUrl,
        why: suggestion.why,
        menuStatus: suggestion.menuStatus,
        menuText: menuTextOf(suggestion.placeId, sources),
        flags: [...flags],
      },
    ];
  });
}
