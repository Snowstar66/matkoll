import type { AiService } from "@/server/ai";
import { cleanModelText } from "@/lib/suggest-input";
import { pickWithAi, type PickPrices } from "../ai-pick";
import { assembleViews, type PlaceEntry } from "../domain/assemble";
import { checkCap, usdPerPlacesRequest, sekPerUsd } from "../domain/cost";
import { buildLlmInput, maxPageChars, type LlmHousehold } from "../domain/llm-input";
import { parsePlaceText, roundCoordinates, type Coordinates } from "../domain/location";
import { ownSiteUrl } from "../domain/own-site";
import { findMenuLinks, htmlToText } from "../domain/page-text";
import { distanceMetres, placeKindOf } from "../domain/place-kinds";
import { parseRestaurantSettings } from "../domain/settings";
import { cuisineIds, cuisines, maxCuisines, type Candidate, type CuisineId, type MenuSource, type PlaceFacts } from "../domain/types";
import { rankCandidates, type HouseholdTaster } from "../domain/weights";
import type { PageFetcher } from "../data/public-fetch";
import type { PlacesOutcome, PlacesQuery, RawPlace } from "../data/places";
import type { FindInput, FindResult } from "./contract";

// The run of "Hitta restaurang", with everything it touches injected so it is tested with fakes (no network, no
// database). The 'use server' file (find-restaurants.ts) wires the real parts. See the legal design in domain/types.ts:
// Google content only goes into the views for the browser; the model gets buildLlmInput's output and nothing else.

export const messages = {
  signedOut: "Du behöver logga in igen.",
  invalid: "Något gick fel med uppgifterna. Försök igen.",
  notOn: "Restaurangsökning är inte påslagen än.",
  placesFailed: "Restaurangsökningen svarar inte just nu. Försök igen om en stund.",
} as const;

export type Household = { people: (HouseholdTaster & { allergies: string[]; likes: string[]; avoids: string[] })[] };

export type RunDeps = {
  signedIn: () => Promise<boolean>;
  apiKey: string | undefined;
  /** What is left of the household's AI cap today, in kronor (Infinity when exempt). */
  dayRemainingSek: () => Promise<number>;
  /** Counts the Places request in the household's daily cost. */
  recordPlacesRequest: () => Promise<void>;
  searchPlaces: (apiKey: string, query: PlacesQuery) => Promise<PlacesOutcome>;
  fetchPage: PageFetcher;
  household: () => Promise<Household>;
  ai: () => Promise<Pick<AiService, "pickRestaurants">>;
  prices: PickPrices;
  now?: () => number;
};

/** How many ranked places are read and sent to the model (inputLimits.pickRestaurants.maxRestaurants). */
export const maxRead = 8;
const maxWords = 12;
const maxWordChars = 40;
const aiDeadlineMs = 60_000;
/** A page with less text than this (a bare splash page) is not worth reading. */
const minPageChars = 40;

const round2 = (value: number) => Math.round(value * 100) / 100;
const placesRequestSek = usdPerPlacesRequest * sekPerUsd;

const word = (text: string) => Array.from(cleanModelText(text)).slice(0, maxWordChars).join("");
const words = (list: readonly string[]) => [...new Set(list.map(word).filter((text) => text !== ""))].slice(0, maxWords);

function toLlmHousehold(household: Household): LlmHousehold {
  return { people: household.people.slice(0, 12).map((person) => ({ allergies: words(person.allergies), likes: words(person.likes), avoids: words(person.avoids) })) };
}

/** Reads the restaurant's own site: its start page and, when the page links one, its menu page. Fetches in parallel across places. */
async function readSites(places: readonly RawPlace[], fetchPage: PageFetcher): Promise<MenuSource[]> {
  const perPlace = await Promise.all(
    places.map(async (place): Promise<MenuSource[]> => {
      const start = ownSiteUrl(place.websiteUri);
      if (!start) return [];
      const home = await fetchPage(start);
      if (!home) return [];
      const out: MenuSource[] = [];
      const homeText = htmlToText(home.html, maxPageChars);
      if (homeText.length >= minPageChars) out.push({ placeId: place.id, url: home.url, text: homeText, via: "fetch" });
      const [menuUrl] = findMenuLinks(home.html, home.url, 1);
      if (menuUrl && menuUrl !== home.url) {
        const menu = await fetchPage(menuUrl);
        const text = menu ? htmlToText(menu.html, maxPageChars) : "";
        if (menu && text.length >= minPageChars) out.push({ placeId: place.id, url: menu.url, text, via: "fetch" });
      }
      return out;
    }),
  );
  return perPlace.flat();
}

export async function runFind(deps: RunDeps, input: FindInput): Promise<FindResult> {
  if (!(await deps.signedIn())) return { status: "error", message: messages.signedOut };
  if (typeof input !== "object" || input === null || typeof input.location !== "object" || input.location === null) return { status: "error", message: messages.invalid };

  // The settings, with the "sugen på" niches of this run merged in (at most three).
  const parsed = parseRestaurantSettings(input.settings);
  const extra = (Array.isArray(input.cuisines) ? input.cuisines : []).filter((id): id is CuisineId => (cuisineIds as readonly unknown[]).includes(id));
  const settings = { ...parsed, cuisines: [...new Set([...parsed.cuisines, ...extra])].slice(0, maxCuisines) };

  let origin: Coordinates | null = null;
  let query: PlacesQuery;
  if (input.location.kind === "coords") {
    origin = roundCoordinates(input.location.lat, input.location.lng);
    if (!origin) return { status: "needs_location" };
    query = { kind: "nearby", at: origin, radiusM: settings.radiusM };
  } else {
    const place = parsePlaceText(input.location.kind === "text" ? input.location.text : null);
    if (!place.ok) return { status: "needs_location" };
    const wanted = settings.cuisines.map((id) => cuisines.find((cuisine) => cuisine.id === id)?.label ?? id);
    query = { kind: "text", text: `${wanted.length > 0 ? `${wanted.join(" ")} ` : ""}restaurang ${place.text}` };
  }

  if (!deps.apiKey) return { status: "error", message: messages.notOn, code: "not_configured" };

  const dayRemaining = await deps.dayRemainingSek();
  if (!checkCap(0, placesRequestSek, dayRemaining).ok) return { status: "cap_reached" };

  const found = await deps.searchPlaces(deps.apiKey, query);
  if (!found.ok) return { status: "error", message: messages.placesFailed, code: "places_failed" };
  await deps.recordPlacesRequest();
  let spentSek = placesRequestSek;

  // Google's answer: facts for the browser, and a Candidate (id, distance, kind) for ranking. Nothing else is kept.
  const byId = new Map<string, RawPlace>();
  const entries = new Map<string, PlaceEntry>();
  const candidates: Candidate[] = [];
  for (const place of found.places) {
    if (place.name === "" || byId.has(place.id)) continue;
    const at = place.lat !== null && place.lng !== null ? { lat: place.lat, lng: place.lng } : null;
    const distanceM = origin ? (at ? distanceMetres(origin, at) : settings.radiusM) : null;
    const facts: PlaceFacts = { placeId: place.id, name: place.name, address: place.address, rating: null, openNow: place.openNow, mapsUrl: place.mapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}` };
    byId.set(place.id, place);
    entries.set(place.id, { facts, distanceM });
    candidates.push({ placeId: place.id, distanceM: distanceM ?? 0, kind: placeKindOf(place.primaryType) });
  }

  const household = await deps.household();
  const ranked = rankCandidates(candidates, settings, household.people);
  if (ranked.length === 0) return { status: "no_results" };
  const rankedIds = ranked.map((entry) => entry.candidate.placeId);

  // Menus: the restaurant's own pages for the best-ranked places.
  const read = rankedIds.slice(0, maxRead).flatMap((id) => byId.get(id) ?? []);
  const sources = await readSites(read, deps.fetchPage);

  let picks: Awaited<ReturnType<typeof pickWithAi>> | null = null;
  if (sources.length > 0) {
    const llm = buildLlmInput(settings, toLlmHousehold(household), read.map((place) => place.id), sources);
    try {
      picks = await pickWithAi(await deps.ai(), llm, sources, deps.prices, { spentSek, dayRemainingSek: dayRemaining }, new AbortController().signal, (deps.now ?? Date.now)() + aiDeadlineMs);
    } catch {
      console.error("restaurant_ai_failed");
    }
  }
  if (picks) spentSek += picks.estimatedSek;

  const hasAllergies = household.people.some((person) => person.allergies.length > 0);
  const used = picks?.status === "ok" ? picks : null;
  const views = assembleViews(rankedIds, entries, used?.picks ?? [], sources, hasAllergies);
  if (views.length === 0) return { status: "no_results" };
  return { status: "ok", suggestions: views, costSek: round2(spentSek), model: used?.model ?? "rules" };
}

