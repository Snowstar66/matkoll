import { maxCuisines, type CuisineId, type PriorityId, type RadiusM } from "../domain/types";
import type { SuggestionView } from "./actions-port";

// The words of the screens (Swedish, no technical terms) and the small pure helpers behind them.

export const texts = {
  cardTitle: "Vill ni ha hjälp att välja restaurang?",
  cardBody: "Sök i Google Maps med dina val ifyllda.",
  whereTitle: "Sök restauranger",
  askingPlace: "Hämtar din plats …",
  placeGot: "Din plats är hämtad.",
  placeGotHint: "Den görs grövre (cirka 1 km), används bara för att öppna kartan och sparas inte.",
  osmLine: "För agentens sökning slås ortnamnet upp hos OpenStreetMap (© OpenStreetMap-bidragsgivare), bara namnet används.",
  placeFailed: "Din plats kunde inte hämtas. Slå på plats för appen i telefonens inställningar och försök igen. Kartan fungerar ändå, den använder då telefonens egen plats.",
  placeUnavailable: "Den här enheten kan inte ge plats. Kartan använder då telefonens egen plats.",
  find: "Låt agenten föreslå ställen",
  mapSearchHint: "Vi fyller i sökningen åt dig. Öppettider och betyg ser du i kartan. Gratis.",
  runningTitle: "Letar åt er",
  runningTakes: "Brukar ta 20 till 60 sekunder.",
  cancel: "Avbryt",
  closeLabel: "Stäng",
  back: "Tillbaka",
  adjust: "Ändra sökningen",
  retry: "Försök igen",
  caveatTitle: "Ring och kolla före ni åker.",
  caveatBody: "Öppettider och menyer kommer från nätet och kan vara gamla.",
  webLine: "Hämtat från webben – kontrollera öppettider och meny. Hämtat nu och sparas inte.",
  directTitle: "Hellre se alla ställen i kartan?",
  directBody: "Vi fyller i sökningen åt dig, öppettider och betyg ser du där.",
  directOpen: "Sök i Google Maps",
  radiusLabel: "Ungefär hur långt",
  radiusHint: "Ett önskemål till sökningen, inget uppmätt avstånd.",
  whenLabel: "När",
  siteLink: "Restaurangens sida",
  ratingCaveat: "Omdömen från webben kan vara gamla eller ojämna.",
  addressMissing: "Adress saknas, öppna kartan.",
  hoursMissing: "Öppettider saknas. Ring och kolla.",
  mapOpen: "Öppna i Google Maps",
  menuFound: "Meny hittad",
  menuMissing: "Meny saknas",
  menuMissingWhy: "Menyn hittades inte, så jag kan inte säga om det passar alla.",
  photoInstead: "Ta en bild på menyn i stället",
  moreAbout: "Mer om stället",
  settingsOpen: "Ställ in sökningen",
  sheetTitle: "Ställ in sökningen",
  sheetDone: "Klar",
  partyLabel: "Vi är",
  prioritiesLabel: "Vad ska väga mest",
  prioritiesHint: "Högst tre. Det som passar allas mat väger alltid.",
  cuisinesLabel: "Sugen på",
  cuisinesHint: "Högst tre. Det ändrar ordningen, det utesluter inget.",
  remembered: "Valen kommer ihåg på den här enheten. Inget sparas hos oss.",
  noResultsTitle: "Inget hittades",
  noResultsBody: "Jag hittade inga ställen jag kunde styrka med en källa. Prova en annan ort eller andra önskemål.",
  capTitle: "Dagens AI-tak är nått",
  capBody: "Hushållet har använt dagens AI-pengar. Det nollställs i natt. Ni kan höja taket i Inställningar.",
  capRaise: "Höj taket",
  needsLocationTitle: "Vi vet inte var ni är",
  needsLocationBody: "Platsen gick inte att läsa av. Slå på plats för appen i telefonens inställningar och försök igen.",
  errorTitle: "Det gick inte",
  errorBody: "Sökningen på webben eller nätet svarade inte. Försök igen om en stund.",
  handoverFound: "Menyn är hämtad.",
  handoverFoundBody: "Den är hämtad från en sida på webben. Kontrollera den på plats.",
  handoverUse: "Låt Menyrådgivaren välja åt oss",
  handoverShowMenu: "Visa menytexten",
  handoverMissing: "Menyn hittades inte på webben.",
  handoverMissingBody: "Ta en bild på den när ni är på plats, så väljer Menyrådgivaren rätter åt er.",
  backToSuggestions: "Tillbaka till förslagen",
} as const;

export const radiusLabels: Record<RadiusM, string> = { 500: "500 m", 1000: "1 km", 2000: "2 km", 5000: "5 km" };

export const priorityLabels: Record<PriorityId, string> = { price: "Prisvärt", quick: "Snabbt", kids: "Barnvänligt", quiet: "Lugnt", veg: "Bra vegetariskt" };

const flagTexts: Record<string, string> = {
  allergy_unverified: "Allergier är inte kontrollerade mot menyn.",
  diet_unverified: "Kost är inte kontrollerad mot menyn.",
};

/** The warnings worth saying out loud; `menu_missing` is the chip, and unknown flags are left out. */
export function flagLines(flags: readonly string[]): string[] {
  return flags.flatMap((flag) => flagTexts[flag] ?? []);
}

/** An address that is safe to put in an href: https only. Anything else is not linked. */
export function safeHttpsUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** "trattoria.se" from a page address, for a source chip. */
export function hostOf(url: string): string | null {
  const safe = safeHttpsUrl(url);
  if (!safe) return null;
  return new URL(safe).hostname.replace(/^www\./, "");
}

export const resultsTitle = (count: number) => (count === 1 ? "1 ställe åt er" : `${count} ställen åt er`);

export const partyText = (party: number) => (party === 1 ? "1 person" : `${party} personer`);

/** The suggestions as shown: at most five, best first as the server ordered them. */
export const shown = (suggestions: readonly SuggestionView[]) => suggestions.slice(0, 5);

/** "enligt trattoria.se, kontrollera": where a quoted address or opening hours come from. */
export const accordingTo = (url: string) => {
  const host = hostOf(url);
  return host ? `enligt ${host}, kontrollera` : "kontrollera";
};

export type MapLink = { label: string; href: string };

/**
 * The link that opens the place in Google Maps: a plain link the person opens themselves (no API, no key, no cost,
 * nothing fetched by us). Only the restaurant's name and the city go in the address, URL-encoded, never coordinates.
 */
export function mapLink(name: string, place: string, view: MapView | null = null): MapLink {
  return mapLinkFor(`${name} ${place}`.trim(), view);
}

/** The phone's rounded position and how far the person wants to go: a map window around it. Lives only in the link the person opens. */
export type MapView = { lat: number; lng: number; radiusM: RadiusM };

/** Google zoom levels for the window: about 15 for 500 m, 14 for 1 km, 13 for 2 km, 12 for 5 km. Approximate. */
export const mapZoom: Record<RadiusM, number> = { 500: 15, 1000: 14, 2000: 13, 5000: 12 };

/**
 * The Google Maps link for a ready search text. The host and path are fixed here; only the encoded text varies. With a
 * `view` (the phone's place was fetched) the map opens around that spot; without, Google Maps uses the phone's own
 * position. The window is approximate and the link form is not verified in the real app.
 */
export function mapLinkFor(text: string, view: MapView | null = null): MapLink {
  const query = encodeURIComponent(text);
  const href = view ? `https://www.google.com/maps/search/${query}/@${view.lat.toFixed(2)},${view.lng.toFixed(2)},${mapZoom[view.radiusM]}z` : `https://www.google.com/maps/search/?api=1&query=${query}`;
  return { label: "Google Maps", href };
}

/** The page of the restaurant to link: its own site when the search returned a page on it, else the first page a reason cites. https only. */
export function siteLinkOf(suggestion: SuggestionView): string | null {
  const candidates = [suggestion.website, ...suggestion.why.map((reason) => reason.sourceUrl)];
  for (const url of candidates) {
    const safe = url ? safeHttpsUrl(url) : null;
    if (safe) return safe;
  }
  return null;
}

/** "Betyg 4,3/5 (120)": the number as a page gave it, with the scale and the count when there is one. */
export function ratingText(rating: { value: number; scale: number; count: number | null }): string {
  const value = (Math.round(rating.value * 10) / 10).toString().replace(".", ",");
  return `Betyg ${value}/${rating.scale}${rating.count !== null ? ` (${rating.count})` : ""}`;
}

/** What the map search says for each "Sugen på" niche: Swedish words as people type them in a map. */
const cuisineSearchWords: Record<CuisineId, string> = {
  pizza: "pizza",
  asiatiskt: "asiatisk",
  italienskt: "italiensk",
  fisk: "fisk",
  hamburgare: "hamburgare",
  husmanskost: "husmanskost",
  mexikanskt: "mexikansk",
  indiskt: "indisk",
  vegetariskt: "vegetarisk",
  sushi: "sushi",
};

/**
 * The search text of "Sök direkt i kartan": the chosen niches (at most three), "restaurang", and the place name of a search result when
 * there is one (the map window comes from the link, see mapLinkFor; without a place Google Maps uses the phone's own position). Nothing else: no
 * names, no allergies, nothing from the household's profile and no coordinates.
 */
export function directMapQuery(cuisines: readonly CuisineId[], place: string | null): string {
  const words = cuisines.slice(0, maxCuisines).map((id) => cuisineSearchWords[id]).filter((word): word is string => Boolean(word));
  return [...words, "restaurang", ...(place && place.trim() !== "" ? [place.trim()] : [])].join(" ");
}
