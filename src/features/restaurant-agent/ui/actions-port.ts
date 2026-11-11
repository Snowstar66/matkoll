import type { RestaurantSettings } from "../domain/types";

// What the screens call. This is a UI-side copy of PR 2's contract (the Server Action `findRestaurants`), kept
// structurally identical so the route layer can pass the real action straight in. The screens know nothing of
// Google, Anthropic or the database (AD-1).

/** Where to look: rounded coordinates from the phone, or a city or postcode typed by hand (already checked by parsePlaceText). */
export type LocationQuery = { kind: "coords"; lat: number; lng: number } | { kind: "text"; text: string };

export type FindInput = { location: LocationQuery; settings: RestaurantSettings; cuisines: string[] };

export type SuggestionView = {
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

export type FindResult =
  | { status: "ok"; suggestions: SuggestionView[]; costSek: number; model: string }
  | { status: "no_results" }
  | { status: "cap_reached" }
  | { status: "needs_location" }
  | { status: "error"; message: string; code?: string };

export type RestaurantAgentActions = {
  findRestaurants: (input: FindInput) => Promise<FindResult>;
};
