import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";
import { searchKey, type IndexedPlace } from "./thing-search";
import { placeTitle } from "./thing-place";
import { shortDateText } from "./thing-photo";

// "Fråga om dina prylar" (Story 18.4): the question and the compact lists
// that go to the AI, text only. Pure.

/** The longest question, in characters. */
export const maxQuestionChars = 300;

export const questionSchema = z
  .string()
  .transform((text) => oneLine(text).normalize("NFC"))
  .refine((text) => text.length > 0, "empty")
  .refine((text) => charLength(text) <= maxQuestionChars, "too long");

/** What the box says and does, in Swedish. */
export const askLabel = "Fråga om dina prylar";
export const askPlaceholder = "Har vi något att måla med?";
export const askButtonText = "Fråga";
export const askingText = "Tänker …";
export const noThingsToAskText = "Fotografera en plats först, så kan du fråga om vad som finns där.";

/** An answer's reference to a place, as a chip: "Skräpförrådet · Hemma · 31 okt". */
export type AskRef = { placeId: string; label: string };

/** A place's chip text: its name, the boende and the card's date. */
export function refLabel(place: Pick<IndexedPlace, "room" | "part" | "siteName" | "cardTakenAt">): string {
  return `${placeTitle(place)} · ${place.siteName} · ${shortDateText(place.cardTakenAt)}`;
}

/** Small words that would match inside a name ("att" in "Kratta") and say nothing about what is asked for. */
const stopWords = new Set(["har", "vi", "ni", "jag", "du", "att", "med", "och", "det", "den", "ett", "som", "var", "finns", "något", "någon", "några", "ligger", "kan", "till", "för", "inte", "min", "mina", "våra", "vår"]);

/** The words of a question that are worth looking for in names: three letters or more, and not a small word. */
export function questionWords(question: string): string[] {
  return searchKey(question)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !stopWords.has(word));
}

/**
 * The places in the order they go to the model: the ones with a thing whose
 * name holds a word of the question (its first four letters, so "måla" finds
 * "Målarfärgsburkar") first, then the newest cards. When the lists are too
 * long for the model, the last ones are left out, so the likely ones stay.
 */
export function rankPlaces(places: readonly IndexedPlace[], question: string): IndexedPlace[] {
  const words = questionWords(question).map((word) => (word.length > 4 ? word.slice(0, 4) : word));
  const relevant = (place: IndexedPlace) =>
    place.things.some((thing) => words.some((word) => searchKey(thing.name).includes(word)));
  return [...places].sort(
    (a, b) => Number(relevant(b)) - Number(relevant(a)) || b.cardTakenAt.getTime() - a.cardTakenAt.getTime() || (a.id < b.id ? -1 : 1),
  );
}
