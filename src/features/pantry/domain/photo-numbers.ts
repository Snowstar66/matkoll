import { z } from "zod";
import { cleanModelText } from "@/lib/suggest-input";
import type { PantrySuggestion } from "./pantry-suggestion";
import type { SuggestionGroups } from "./place-inventory";

// Nummer på fotot (Story 6.6, 12.5): after the cards from a photo have come,
// the same job looks up the AI's items in reading order (the result's
// `reading`) on the same photo, and gives a point per item. A
// card's number is the number of its first item in the reading; the large
// photo gets a marker with the card's number on each of the card's items.
// Only cards that are shown have numbers, so every marker has a card. Pure,
// so it is tested without a model.

/** At most this many items in a reading: the AI's first 25 (maxPantrySuggestions, the AI port's inputLimits.analyze.maxItems). */
export const maxReadingItems = 25;
/** The longest label in a reading (the AI port's maxPantryItemTextChars, maxSuggestionLabelChars). */
export const maxReadingLabelChars = 200;
/** A point's coordinates are thousandths of the photo's width and height, from its top left corner. */
export const maxPointCoordinate = 1000;

/** A label in a reading: on one line (cleanModelText leaves it as it is), not empty, at most maxReadingLabelChars. */
export const readingLabelSchema = z
  .string()
  .min(1)
  .max(maxReadingLabelChars)
  .refine((label) => label === cleanModelText(label), { message: "One line of text" });

/** The reading: the AI's items in reading order (item n is reading[n − 1]), at most maxReadingItems. */
export const readingSchema = z.array(readingLabelSchema).max(maxReadingItems);

/**
 * The label of an item whose own label had nothing left after cleaning: it
 * keeps the item's number in the reading, but its point is never used, since
 * the model was asked where "vara" is.
 */
export const readingPlaceholder = "vara";

/**
 * An item's label as the reading keeps it: on one line, without control or
 * format characters, at most maxReadingLabelChars, and readingPlaceholder
 * when nothing is left, so every item keeps its number.
 */
export function readingLabel(label: string): string {
  let text = cleanModelText(label);
  if (text.length > maxReadingLabelChars) {
    // Cut by code points, so a character is never cut in half.
    const points = Array.from(text);
    while (points.join("").length > maxReadingLabelChars) points.pop();
    text = points.join("").trim();
  }
  return text || readingPlaceholder;
}

/** What the numbers step takes with the photo: the reading's labels, 1 to maxReadingItems. */
export const locateLabelsSchema = z.array(readingLabelSchema).min(1).max(maxReadingItems);

const coordinate = z.number().min(0).max(maxPointCoordinate);

/** One item's point: its number in the reading and [x, y] in thousandths. */
export const photoPointSchema = z.object({
  n: z.number().int().min(1).max(maxReadingItems),
  x: coordinate,
  y: coordinate,
});
export type PhotoPoint = z.infer<typeof photoPointSchema>;

/** The points the numbers step gives, checked by the client too: at most one per item. */
export const locateResultSchema = z.object({
  positions: z.array(photoPointSchema).max(maxReadingItems),
});
export type LocateResult = z.infer<typeof locateResultSchema>;

/**
 * The numbers of a photo during review: being looked up (`pending`), none
 * (the lookup failed, was stopped, or there is nothing to look up) or
 * `ready` with the points by item number.
 */
export type PhotoNumbers =
  | { kind: "pending" }
  | { kind: "none" }
  | { kind: "ready"; points: ReadonlyMap<number, PhotoPoint> };

/**
 * The points of an answer by item number (the first point per number),
 * without the points of placeholder items (readingPlaceholder in `reading`)
 * and of numbers beyond it.
 */
export function pointsByNumber(result: LocateResult, reading: readonly string[]): ReadonlyMap<number, PhotoPoint> {
  const points = new Map<number, PhotoPoint>();
  for (const point of result.positions) {
    const label = reading[point.n - 1];
    if (label === undefined || label === readingPlaceholder || points.has(point.n)) continue;
    points.set(point.n, point);
  }
  return points;
}

/**
 * The cards that can have a number (Story 6.6): exactly the suggestion cards
 * Lagerförslag shows, "Nytt" and "Ändrat" (or the plain list), in their
 * order. Oförändrade suggestions and "Syns inte längre" have none.
 */
export function numberedCards(groups: Pick<SuggestionGroups, "added" | "changed">): PantrySuggestion[] {
  return [...groups.added, ...groups.changed];
}

/** Whether a lookup of the numbers can give any card a number: a reading, and a card shown with item numbers. */
export function hasNumberableCards(groups: Pick<SuggestionGroups, "added" | "changed">, reading: readonly string[]): boolean {
  return reading.length > 0 && numberedCards(groups).some((card) => (card.itemNumbers ?? []).length > 0);
}

/**
 * The card's number on the photo: the first of its item numbers that has a
 * point, so the number is always on a marker of the card's own item; `null`
 * when none has.
 */
export function cardNumber(
  suggestion: Pick<PantrySuggestion, "itemNumbers">,
  points: ReadonlyMap<number, PhotoPoint>,
): number | null {
  return (suggestion.itemNumbers ?? []).find((n) => points.has(n)) ?? null;
}

/** A marker on the photo: the card's number at an item's point, in percent of the photo's width and height. */
export type PhotoMarker = { key: number; label: number; left: number; top: number };

/**
 * The markers for the cards shown: one per item of a card that has a point,
 * with the card's number (cardNumber), in the cards' order. An item behind
 * two cards (one ingredient in two units) gets one marker.
 */
export function photoMarkers(
  cards: readonly Pick<PantrySuggestion, "itemNumbers">[],
  points: ReadonlyMap<number, PhotoPoint>,
): PhotoMarker[] {
  const markers: PhotoMarker[] = [];
  const marked = new Set<number>();
  for (const card of cards) {
    const label = cardNumber(card, points);
    if (label === null) continue;
    for (const n of card.itemNumbers ?? []) {
      const point = points.get(n);
      if (!point || marked.has(n)) continue;
      marked.add(n);
      markers.push({ key: n, label, left: point.x / 10, top: point.y / 10 });
    }
  }
  return markers;
}

/** The card's number for a screen reader: "Nummer 3 på fotot". */
export function photoNumberText(n: number): string {
  return `Nummer ${n} på fotot`;
}

/** Under the photo's thumbnail while the points are looked up. */
export const locatingText = "Letar upp varorna på fotot …";

/** Under the photo's thumbnail once the cards have numbers. */
export const numbersReadyText = "Numren på korten visar var varorna är på fotot.";

/** The status under the thumbnail for the photo's numbers: empty when there are none. */
export function photoNumbersStatus(numbers: PhotoNumbers, hasNumbers: boolean): string {
  if (numbers.kind === "pending") return locatingText;
  return numbers.kind === "ready" && hasNumbers ? numbersReadyText : "";
}
