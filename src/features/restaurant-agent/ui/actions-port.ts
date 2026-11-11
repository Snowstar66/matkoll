import type { RestaurantSettings } from "../domain/types";

// What the screens call. This is a UI-side copy of PR 2's contract (the Server Action `findRestaurants`), kept
// structurally identical so the route layer can pass the real action straight in. The screens know nothing of
// Anthropic, OpenStreetMap or the database (AD-1).

/** Where to look: rounded coordinates from the phone (the server looks up the place name; only the name goes on) (the server also accepts a typed city or postcode; the screens no longer offer it). */
export type LocationQuery = { kind: "coords"; lat: number; lng: number } | { kind: "text"; text: string };

export type FindInput = { location: LocationQuery; settings: RestaurantSettings; cuisines: string[] };

export type SuggestionView = {
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

export type FindResult =
  | { status: "ok"; suggestions: SuggestionView[]; costSek: number; model: string; place: string }
  | { status: "no_results" }
  | { status: "cap_reached" }
  | { status: "needs_location" }
  | { status: "error"; message: string; code?: string };

export type RestaurantAgentActions = {
  /** The AI web search (parked behind the Tillval restaurantAgentWeb). */
  findRestaurants: (input: FindInput) => Promise<FindResult>;
};
