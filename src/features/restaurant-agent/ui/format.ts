import type { PriorityId, RadiusM } from "../domain/types";
import type { SuggestionView } from "./actions-port";

// The words of the screens (Swedish, no technical terms) and the small pure helpers behind them.

export const texts = {
  cardTitle: "Vet inte var ni ska äta?",
  cardBody: "Jag letar upp ställen i närheten som passar alla.",
  whereTitle: "Var vill ni äta?",
  whereSub: "Fyra val. Resten sköter jag.",
  useMyPlace: "Använd min plats",
  askingPlace: "Hämtar platsen …",
  placeHint: "Telefonen frågar om ni tillåter plats. Platsen används en gång för att hitta ställen och sparas inte.",
  placeGot: "Platsen är hämtad. Den görs lite grövre (cirka 100 meter) innan den skickas.",
  placeFailed: "Vi fick ingen plats. Telefonen sa nej, eller platsen gick inte att läsa. Skriv en ort eller ett postnummer i stället.",
  placeUnavailable: "Den här enheten kan inte ge plats. Skriv en ort eller ett postnummer i stället.",
  textLabel: "Eller skriv ort eller postnummer",
  textPlaceholder: "Till exempel Uppsala eller 753 20",
  textInvalid: "Skriv bara en ort eller ett postnummer, till exempel Uppsala eller 753 20.",
  textTooLong: "Det är för långt. Skriv bara en ort eller ett postnummer.",
  find: "Hitta ställen",
  runningTitle: "Letar åt er",
  runningTakes: "Brukar ta 20 till 40 sekunder.",
  cancel: "Avbryt",
  closeLabel: "Stäng",
  back: "Tillbaka",
  adjust: "Ändra sökningen",
  retry: "Försök igen",
  caveatTitle: "Ring och kolla före ni åker.",
  caveatBody: "Öppettider och menyer kommer från nätet och kan vara gamla.",
  googleLine: "Plats och öppettider från Google Maps. Hämtade nu och sparas inte.",
  menuFound: "Meny hittad",
  menuMissing: "Meny saknas",
  menuMissingWhy: "Menyn hittades inte, så jag kan inte säga om det passar alla.",
  photoInstead: "Ta en bild på menyn i stället",
  moreAbout: "Mer om stället",
  settingsOpen: "Ställ in sökningen",
  sheetTitle: "Ställ in sökningen",
  sheetDone: "Klar",
  radiusLabel: "Avstånd",
  partyLabel: "Vi är",
  prioritiesLabel: "Vad ska väga mest",
  prioritiesHint: "Högst tre. Det som passar allas mat väger alltid.",
  cuisinesLabel: "Sugen på",
  cuisinesHint: "Högst tre. Det ändrar ordningen, det utesluter inget.",
  remembered: "Valen kommer ihåg på den här enheten. Inget sparas hos oss.",
  noResultsTitle: "Inget hittades",
  noResultsBody: "Det finns inga ställen som passar just nu inom det avståndet. Prova längre avstånd eller en annan plats.",
  widen: "Sök inom längre avstånd",
  capTitle: "Dagens AI-tak är nått",
  capBody: "Hushållet har använt dagens AI-pengar. Det nollställs i natt. Ni kan höja taket i Inställningar.",
  capRaise: "Höj taket",
  needsLocationTitle: "Vi vet inte var ni är",
  needsLocationBody: "Tryck på Använd min plats, eller skriv en ort eller ett postnummer.",
  errorTitle: "Det gick inte",
  errorBody: "Karttjänsten eller nätet svarade inte. Försök igen om en stund.",
  handoverFound: "Menyn är hämtad.",
  handoverFoundBody: "Den kommer från restaurangens egen hemsida.",
  handoverUse: "Låt Menyrådgivaren välja åt oss",
  handoverShowMenu: "Visa menytexten",
  handoverMissing: "Menyn hittades inte på nätet.",
  handoverMissingBody: "Ta en bild på den när ni är på plats, så väljer Menyrådgivaren rätter åt er.",
  backToSuggestions: "Tillbaka till förslagen",
} as const;

export const radiusLabels: Record<RadiusM, string> = { 500: "500 m", 1000: "1 km", 2000: "2 km", 5000: "5 km" };

export const priorityLabels: Record<PriorityId, string> = { price: "Prisvärt", quick: "Snabbt", kids: "Barnvänligt", quiet: "Lugnt", veg: "Bra vegetariskt" };

/** "700 m", "1,2 km"; null when the distance is not known. */
export function distanceText(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(Math.round(meters / 100) / 10).toString().replace(".", ",")} km`;
}

/** The open/closed line, always with its source: Google's hours are a claim, not a fact. */
export function openText(openNow: boolean | null): string | null {
  if (openNow === null) return null;
  return openNow ? "Öppet nu enligt Google Maps" : "Stängt nu enligt Google Maps";
}

const flagTexts: Record<string, string> = {
  allergy_unverified: "Allergier är inte kontrollerade mot menyn.",
  diet_unverified: "Kost är inte kontrollerad mot menyn.",
  open_hours_unverified: "Öppettiderna är osäkra.",
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
