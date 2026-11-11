import type { RestaurantSettings } from "../domain/types";

// The contract of the Restaurangagent server action. Types only, safe to import from the client. The action returns a
// discriminated union and never throws for an expected case.
//
// Everything here comes from the web through Anthropic's search tool and is shown as "Hämtat från webben". `why` and
// `menuText` are quoted from pages the search returned, each reason with its page; nothing is stored.

/**
 * The phone's position, rounded (about 1 km), or a typed city or postcode. The SERVER turns a position into a place
 * name at OpenStreetMap's Nominatim; only the name goes on to Claude. A position is never stored, logged or sent to Anthropic.
 */
export type LocationQuery = { kind: "coords"; lat: number; lng: number } | { kind: "text"; text: string };

export type FindInput = {
  location: LocationQuery;
  settings: RestaurantSettings;
  /** "Sugen på": cuisine ids (domain/types.ts cuisineIds); unknown ones are ignored. */
  cuisines: string[];
};

export type SuggestionView = {
  /** Stable hash of the name and the website. */
  id: string;
  name: string;
  /** Only when a cited page says it. */
  area: string | null;
  /** The restaurant's own address, only when the search returned a page on that site. */
  website: string | null;
  /** Short reasons, each with the page it comes from. */
  why: { text: string; sourceUrl: string }[];
  menuStatus: "found" | "missing";
  /** Menu text quoted from a cited page, for handover to the Menyrådgivare; null when none was found. */
  menuText: string | null;
  /** The street address and the opening hours as a cited page wrote them, with that page; null when no page gave them (the card then says so and links the map). */
  address: { text: string; sourceUrl: string } | null;
  hours: { text: string; sourceUrl: string } | null;
  /** A rating a returned page states outright (one source, never an average), with its page; null when none. Shown as a number with source and link. */
  rating: { value: number; scale: number; count: number | null; sourceName: string; sourceUrl: string } | null;
  /** Warning flags: menu_missing, allergy_unverified, diet_unverified, open_hours_unverified. */
  flags: string[];
};

export type FindResult =
  /** `place`: the city or district the search used (the typed text, or the name looked up for a position), for the map link and the headline. */
  | { status: "ok"; suggestions: SuggestionView[]; costSek: number; model: string; place: string }
  | { status: "no_results" }
  | { status: "cap_reached" }
  | { status: "needs_location" }
  | { status: "error"; message: string; code?: string };
