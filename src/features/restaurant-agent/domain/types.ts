// TRUST AND SOURCES DESIGN (Pontus, 2026-11-11). READ BEFORE CHANGING ANYTHING HERE.
//
// Restaurangagenten finds restaurants with Anthropic's web search tool, billed inside the Claude API (10 USD per 1000
// searches). No other paid source: no Google data anywhere, no coordinates, no map service. The rules of this module:
//
//  1. The only place the household gives is a typed city or postcode (domain/location.ts). It goes to Anthropic as the
//     search tool's city and in the message, and is never stored. Nothing about where a person is leaves the phone otherwise.
//  2. The model may only write what a page it found says, and every reason carries that page's address. The guard
//     (domain/guard.ts) lets a reason through only if its address is one the search tool actually returned in this run;
//     a place with no such reason is dropped. Names, addresses, hours and prices are never invented: they appear only
//     when quoted from a cited page, and hours only as "enligt <källa>" with "ring och kolla".
//  3. Web text is untrusted data, never instructions (the prompt says so). The household's allergies are never a safety
//     claim: a menu can never prove a dish safe, so the flag `allergy_unverified` is set by us whenever anyone has one.
//  4. Cost is counted in kronor: tokens plus searches (domain/cost.ts), 2 kr cap per run on top of the household's day cap.
//
// This feature is kept small and self-contained so it can be hidden or deleted in one PR (see the PR description's
// deletion checklist).

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

/** How far the person wants to go. A soft wish to the search ("ungefär 2 km från <ort>"), never a measured distance. */
export const radiiM = [500, 1000, 2000, 5000] as const;
export type RadiusM = (typeof radiiM)[number];
export const defaultRadiusM: RadiusM = 1000;

/** When they want to eat: a soft wish too ("föredra ställen som enligt en källa har öppet ikväll"). */
export const whenOptions = [
  { id: "evening", label: "Ikväll", prompt: "ikväll" },
  { id: "lunch", label: "Lunch idag", prompt: "lunch idag" },
  { id: "any", label: "Valfri tid", prompt: "" },
] as const;
export type WhenId = (typeof whenOptions)[number]["id"];
export const whenIds = whenOptions.map((option) => option.id) as [WhenId, ...WhenId[]];
export const defaultWhen: WhenId = "evening";

export const minParty = 1;
export const maxParty = 12;
export const defaultParty = 2;

/** What the user chooses for one run. Nothing here is stored (d7). */
export type RestaurantSettings = {
  radiusM: RadiusM;
  when: WhenId;
  /** How many eat together, 1-12. */
  party: number;
  /** "Sugen på": cuisine niches that weigh in, in addition to the household's food profile. */
  cuisines: CuisineId[];
  priorities: PriorityId[];
};

export const defaultRestaurantSettings: Readonly<RestaurantSettings> = {
  radiusM: defaultRadiusM,
  when: defaultWhen,
  party: defaultParty,
  cuisines: [],
  priorities: [],
};

export type Reason = { text: string; sourceUrl: string };

export const warningFlags = ["menu_missing", "allergy_unverified", "diet_unverified", "open_hours_unverified"] as const;
export type WarningFlag = (typeof warningFlags)[number];

/** A restaurant the model found, after the guard: every reason cites a page the search returned. */
/** A rating a returned page states outright. One source, never an average; shown as a number with its source and link. */
export type Rating = { value: number; scale: number; count: number | null; sourceName: string; sourceUrl: string };

export type Suggestion = {
  /** Stable hash of the name and the website (suggestionId). */
  id: string;
  name: string;
  /** City district or street, only when a cited page says so. */
  area: string | null;
  /** The restaurant's own address, only when the search returned a page on that site. */
  website: string | null;
  /** Short reasons, each with the page it comes from. Never empty. */
  why: Reason[];
  /** Menu text quoted from a cited page, for handover to Menyrådgivaren. */
  menu: Reason | null;
  /** Street address and opening hours as a cited page wrote them, with that page; null when no returned page gave them. */
  address: Reason | null;
  hours: Reason | null;
  /** Only when a returned page states it and the number stands in the quoted text; null otherwise (the place stays). */
  rating: Rating | null;
  menuStatus: "found" | "missing";
  warnings: WarningFlag[];
};

/** A stable id from the name and the website, so a re-run of the same place has the same id (FNV-1a, two seeds). */
export function suggestionId(name: string, website: string | null): string {
  const text = `${name.trim().toLowerCase()}|${(website ?? "").trim().toLowerCase()}`;
  const hash = (seed: number) => {
    let h = seed;
    for (let index = 0; index < text.length; index += 1) {
      h ^= text.charCodeAt(index);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  };
  return `${hash(2166136261)}${hash(0x9747b28c)}`;
}
