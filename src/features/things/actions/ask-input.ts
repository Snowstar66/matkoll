import { cleanModelText } from "@/lib/suggest-input";
import { askThingsText, inputLimits, type AskThingsInput, type AskThingsPlace } from "@/server/ai";
import { placeTitle } from "../domain/thing-place";
import { shortDateText } from "../domain/thing-photo";
import { rankPlaces } from "../domain/thing-ask";
import type { IndexedPlace } from "../domain/thing-search";

// What goes to the AI with a question (Story 18.4): the compact lists, text
// only. Names, category, where on the card, place, boende and the card's date
// of each place; nothing else, never an image or an id. When they are too long
// for the model (inputLimits.ask.maxChars) the where-on-the-card goes first,
// then the places that fit the question least, so the likely ones stay.

function toPlace(place: IndexedPlace, withWhere: boolean, maxThings: number): AskThingsPlace {
  const things = place.things.flatMap((thing) => {
    const name = cleanModelText(thing.name);
    if (name === "") return [];
    const where = withWhere && thing.whereHint ? cleanModelText(thing.whereHint) : "";
    return [{ name, category: thing.category, where: where === "" ? null : where }];
  });
  return {
    title: cleanModelText(placeTitle(place)) || "Plats",
    site: cleanModelText(place.siteName) || "Boende",
    cardDate: shortDateText(place.cardTakenAt),
    hidden: Math.max(0, Math.round(place.hidden)),
    things: things.slice(0, maxThings),
  };
}

/**
 * The question with the lists that fit, and the places they are of in the
 * order of the model's numbers (the answer's numbers are indexes into it).
 * `null` when there is nothing to ask about: no place has a thing or a closed
 * container.
 */
export function buildAskInput(
  places: readonly IndexedPlace[],
  question: string,
): { input: AskThingsInput; used: IndexedPlace[] } | null {
  const { maxChars, maxPlaces } = inputLimits.ask;
  const ranked = rankPlaces(
    places.filter((place) => place.things.length > 0 || place.hidden > 0),
    question,
  ).slice(0, maxPlaces);
  if (ranked.length === 0) return null;
  const fits = (list: IndexedPlace[], withWhere: boolean, maxThings = Infinity) => {
    const input = { question, places: list.map((place) => toPlace(place, withWhere, maxThings)) };
    return askThingsText(input).length <= maxChars ? input : null;
  };
  // Everything with where on the card, then everything without it, then fewer places.
  for (const withWhere of [true, false]) {
    const input = fits(ranked, withWhere);
    if (input) return { input, used: ranked };
  }
  for (let count = ranked.length - 1; count >= 1; count--) {
    const used = ranked.slice(0, count);
    const input = fits(used, false);
    if (input) return { input, used };
  }
  // The likeliest place alone is too long: its first things.
  const [first] = ranked;
  for (let count = first.things.length; ; count = Math.floor(count / 2)) {
    const input = fits([first], false, count);
    if (input) return { input, used: [first] };
    if (count === 0) break;
  }
  return null;
}
