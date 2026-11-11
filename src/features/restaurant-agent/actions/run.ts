import type { AiService } from "@/server/ai";
import { cleanModelText } from "@/lib/suggest-input";
import { findWithAi, type FindPrices } from "../ai-find";
import { assembleViews } from "../domain/assemble";
import { buildLlmInput, type LlmHousehold } from "../domain/llm-input";
import { parsePlaceText, roundCoordinates } from "../domain/location";
import { parseRestaurantSettings } from "../domain/settings";
import { cuisineIds, maxCuisines, type CuisineId } from "../domain/types";
import type { PlaceLookup } from "../data/reverse-geocode";
import type { FindInput, FindResult } from "./contract";

// The run of "Hitta restaurang", with everything it touches injected so it is tested with fakes (no network, no
// database). The 'use server' file (find-restaurants.ts) wires the real parts. See the design in domain/types.ts.

export const messages = {
  signedOut: "Du behöver logga in igen.",
  invalid: "Något gick fel med uppgifterna. Försök igen.",
  searchFailed: "Sökningen på webben svarar inte just nu. Försök igen om en stund.",
} as const;

export type Household = { people: { allergies: string[]; likes: string[]; avoids: string[] }[] };

export type RunDeps = {
  signedIn: () => Promise<boolean>;
  /** What is left of the household's AI cap today, in kronor (Infinity when exempt). */
  dayRemainingSek: () => Promise<number>;
  household: () => Promise<Household>;
  /** A place name for a rounded position (OpenStreetMap Nominatim); null when switched off. A failure falls back to the typed field. */
  placeOf: PlaceLookup | null;
  /** The port: its calls report tokens and searches to the household's daily cost themselves. */
  ai: () => Promise<Pick<AiService, "findRestaurantsWeb">>;
  prices: FindPrices;
  now?: () => number;
};

const maxWords = 12;
const maxWordChars = 40;
const aiDeadlineMs = 90_000;

const round2 = (value: number) => Math.round(value * 100) / 100;

const word = (text: string) => Array.from(cleanModelText(text)).slice(0, maxWordChars).join("");
const words = (list: readonly string[]) => [...new Set(list.map(word).filter((text) => text !== ""))].slice(0, maxWords);

function toLlmHousehold(household: Household): LlmHousehold {
  return { people: household.people.slice(0, 12).map((person) => ({ allergies: words(person.allergies), likes: words(person.likes), avoids: words(person.avoids) })) };
}

export async function runFind(deps: RunDeps, input: FindInput): Promise<FindResult> {
  if (!(await deps.signedIn())) return { status: "error", message: messages.signedOut };
  if (typeof input !== "object" || input === null || typeof input.location !== "object" || input.location === null) return { status: "error", message: messages.invalid };

  // The settings, with the "sugen på" niches of this run merged in (at most three).
  const parsed = parseRestaurantSettings(input.settings);
  const extra = (Array.isArray(input.cuisines) ? input.cuisines : []).filter((id): id is CuisineId => (cuisineIds as readonly unknown[]).includes(id));
  const settings = { ...parsed, cuisines: [...new Set([...parsed.cuisines, ...extra])].slice(0, maxCuisines) };

  // A position becomes a place name here on the server, and only the name goes on. Any failure sends the person to the typed field.
  let placeText: string;
  if (input.location.kind === "coords") {
    const rounded = roundCoordinates(input.location.lat, input.location.lng);
    if (!rounded || !deps.placeOf) return { status: "needs_location" };
    const looked = await deps.placeOf(rounded.lat, rounded.lng);
    if (!looked.ok) return { status: "needs_location" };
    placeText = looked.place;
  } else {
    const place = parsePlaceText(input.location.kind === "text" ? input.location.text : null);
    if (!place.ok) return { status: "needs_location" };
    placeText = place.text;
  }

  const dayRemaining = await deps.dayRemainingSek();
  const household = await deps.household();
  const llm = buildLlmInput(settings, toLlmHousehold(household), placeText);

  let found: Awaited<ReturnType<typeof findWithAi>> | null = null;
  try {
    found = await findWithAi(await deps.ai(), llm, deps.prices, { spentSek: 0, dayRemainingSek: dayRemaining }, new AbortController().signal, (deps.now ?? Date.now)() + aiDeadlineMs);
  } catch {
    console.error("restaurant_ai_failed");
  }
  if (!found || found.status === "failed") return { status: "error", message: messages.searchFailed, code: "search_failed" };
  if (found.status === "cap_reached") return { status: "cap_reached" };

  const views = assembleViews(found.picks, household.people.some((person) => person.allergies.length > 0));
  if (views.length === 0) return { status: "no_results" };
  return { status: "ok", suggestions: views, costSek: round2(found.spentSek), model: found.model, place: placeText };
}
