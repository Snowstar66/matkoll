import type { RestaurantSettings } from "../domain/types";

// The contract of the Restaurangagent server action (PR 2). Types only, safe to import from the client. The action
// returns a discriminated union and never throws for an expected case.
//
// Google content (name, address, openNow, mapsUrl) is returned to the browser for live display with "Google Maps"
// attribution and is never stored, logged or sent to the model. `why` and `menuText` come from the restaurant's own site.

export type LocationQuery = { kind: "coords"; lat: number; lng: number } | { kind: "text"; text: string };

export type FindInput = {
  location: LocationQuery;
  settings: RestaurantSettings;
  /** "Sugen på": cuisine ids (domain/types.ts cuisineIds); unknown ones are ignored. */
  cuisines: string[];
};

export type SuggestionView = {
  placeId: string;
  name: string;
  address: string;
  /** Metres from the coordinates; null when the place was found by a typed city or postcode. */
  distanceM: number | null;
  openNow: boolean | null;
  mapsUrl: string;
  /** Short reasons, each with the restaurant's own page it comes from. */
  why: { text: string; sourceUrl: string }[];
  menuStatus: "found" | "missing";
  /** Text from the restaurant's own site, for handover to the Menyrådgivare; null when none was found. */
  menuText: string | null;
  /** Warning flags: menu_missing, allergy_unverified, diet_unverified, open_hours_unverified. */
  flags: string[];
};

export type FindResult =
  | { status: "ok"; suggestions: SuggestionView[]; costSek: number; model: string }
  | { status: "no_results" }
  | { status: "cap_reached" }
  | { status: "needs_location" }
  | { status: "error"; message: string; code?: string };
