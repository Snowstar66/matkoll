// LEGAL DESIGN (Google Maps Platform ToS 3.2.3, decided by Pontus 2026-11-11). READ BEFORE CHANGING ANYTHING HERE.
//
// Google Maps Content may not be used to create content from, stored, or used to train or test models. Whether sending
// Places fields to an LLM counts is unclear, so we do not do it. The rules of this module:
//
//  1. Google Places is ONLY the finder. It gives us a `Candidate` (place_id and distance) and, shown live to the
//     user with "Google Maps" attribution and never altered, `PlaceFacts`.
//  2. Names, addresses, ratings, opening hours, reviews and website text from Google are NEVER sent to Claude and
//     NEVER stored. At most the place_id may be stored (and by default nothing is: Pontus d7).
//  3. Claude ranks and summarises ONLY from the restaurant's own website or menu text (`MenuSource`, fetched by us or
//     by web search) and from the household profile (`LlmHousehold`).
//  4. The two worlds are separate types with no shared object: `PlaceFacts` and `Candidate` are branded, and
//     `LlmInput` (domain/llm-input.ts) is built field by field from `LlmHousehold`, `LlmRestaurant` and
//     `MenuSource`, so a Places field cannot reach a prompt. domain/llm-input.test.ts asserts it.
//  5. Location: the user's coordinates are rounded to 3 decimals (domain/location.ts), sent only to Google, never to
//     Anthropic and never stored.

export const cuisines = [
  { id: "pizza", label: "Pizza" },
  { id: "asiatiskt", label: "Asiatiskt" },
  { id: "italienskt", label: "Italienskt" },
  { id: "fisk", label: "Fisk och skaldjur" },
  { id: "hamburgare", label: "Hamburgare" },
  { id: "husmanskost", label: "Husmanskost" },
  { id: "mexikanskt", label: "Mexikanskt" },
  { id: "indiskt", label: "Indiskt" },
  { id: "vegetariskt", label: "Vegetariskt" },
  { id: "sushi", label: "Sushi" },
] as const;
export type CuisineId = (typeof cuisines)[number]["id"];
export const cuisineIds = cuisines.map((cuisine) => cuisine.id) as [CuisineId, ...CuisineId[]];
/** "Sugen på": at most this many niches per run, so the weight stays a preference and not a filter. */
export const maxCuisines = 3;

export const priorities = [
  { id: "price", label: "Prisvärt" },
  { id: "quick", label: "Snabbt" },
  { id: "kids", label: "Barnvänligt" },
  { id: "quiet", label: "Lugnt" },
  { id: "veg", label: "Bra vegetariskt" },
] as const;
export type PriorityId = (typeof priorities)[number]["id"];
export const priorityIds = priorities.map((priority) => priority.id) as [PriorityId, ...PriorityId[]];
export const maxPriorities = 3;

export const radiiM = [500, 1000, 2000, 5000] as const;
export type RadiusM = (typeof radiiM)[number];
export const defaultRadiusM: RadiusM = 1000;
export const minParty = 1;
export const maxParty = 12;
export const defaultParty = 2;

/** What the user chooses for one run. Nothing here is stored (d7). */
export type RestaurantSettings = {
  radiusM: RadiusM;
  /** How many eat together, 1-12. */
  party: number;
  /** "Sugen på": cuisine niches that weigh in, in addition to the household's food profile. */
  cuisines: CuisineId[];
  priorities: PriorityId[];
};

export const defaultRestaurantSettings: Readonly<RestaurantSettings> = {
  radiusM: defaultRadiusM,
  party: defaultParty,
  cuisines: [],
  priorities: [],
};

declare const googleContent: unique symbol;

/** The coarse kind of a place, mapped by us from Google's primary type; used only to weigh and to show. */
export type PlaceKind = CuisineId | "restaurant" | "cafe" | "bar" | "other";

/** What the finder returns: the id Google gave and how far away it is. Google-derived: never goes to Claude, except the id as an opaque handle. */
export type Candidate = {
  readonly [googleContent]?: true;
  placeId: string;
  distanceM: number;
  kind: PlaceKind;
};

/** Google fields shown live with "Google Maps" attribution, never altered, never stored, never sent to Claude. */
export type PlaceFacts = {
  readonly [googleContent]?: true;
  placeId: string;
  name: string;
  address: string;
  rating: number | null;
  openNow: boolean | null;
  mapsUrl: string;
};

/** Where a piece of menu text came from: the restaurant's own site, fetched by us or via web search. Never Google. */
export type MenuSource = {
  placeId: string;
  /** The restaurant's own page. */
  url: string;
  text: string;
  via: "fetch" | "web_search";
};

export type Reason = { text: string; sourceUrl: string };

export const warningFlags = ["menu_missing", "allergy_unverified", "diet_unverified", "open_hours_unverified"] as const;
export type WarningFlag = (typeof warningFlags)[number];

export type Suggestion = {
  placeId: string;
  /** Short reasons, each with the page it comes from. */
  why: Reason[];
  menuStatus: "found" | "missing";
  warnings: WarningFlag[];
};

export type RunResult =
  | { status: "ok"; suggestions: Suggestion[]; costSek: number }
  | { status: "no_results"; costSek: number }
  | { status: "cap_reached"; cap: "run" | "day"; costSek: number }
  | { status: "needs_location" };
