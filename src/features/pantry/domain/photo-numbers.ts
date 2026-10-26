import { z } from "zod";
import { cleanModelText } from "@/lib/suggest-input";
import type { PantrySuggestion } from "./pantry-suggestion";

// Nummer på fotot (Story 6.6): after the cards from a photo have come, the
// client sends the same photo and the AI's items in reading order (the
// answer's `reading`) to /api/ai/locate, and gets a point per item back. A
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

/**
 * An item's label as the reading keeps it: on one line, without control or
 * format characters, at most maxReadingLabelChars, and "vara" when nothing
 * is left, so every item keeps its number.
 */
export function readingLabel(label: string): string {
  let text = cleanModelText(label);
  if (text.length > maxReadingLabelChars) {
    // Cut by code points, so a character is never cut in half.
    const points = Array.from(text);
    while (points.join("").length > maxReadingLabelChars) points.pop();
    text = points.join("").trim();
  }
  return text || "vara";
}

/** What the client sends to /api/ai/locate with the photo: the reading's labels, 1 to maxReadingItems. */
export const locateLabelsSchema = z.array(readingLabelSchema).min(1).max(maxReadingItems);

const coordinate = z.number().min(0).max(maxPointCoordinate);

/** One item's point: its number in the reading and [x, y] in thousandths. */
export const photoPointSchema = z.object({
  n: z.number().int().min(1).max(maxReadingItems),
  x: coordinate,
  y: coordinate,
});
export type PhotoPoint = z.infer<typeof photoPointSchema>;

/** What /api/ai/locate answers, checked by the client too: the points, at most one per item. */
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

/** The points of an answer by item number (the first point per number). */
export function pointsByNumber(result: LocateResult): ReadonlyMap<number, PhotoPoint> {
  const points = new Map<number, PhotoPoint>();
  for (const point of result.positions) if (!points.has(point.n)) points.set(point.n, point);
  return points;
}

/** The card's number on the photo: its first item's number, when one of its items has a point; `null` otherwise. */
export function cardNumber(
  suggestion: Pick<PantrySuggestion, "itemNumbers">,
  points: ReadonlyMap<number, PhotoPoint>,
): number | null {
  const numbers = suggestion.itemNumbers ?? [];
  if (numbers.length === 0 || !numbers.some((n) => points.has(n))) return null;
  return numbers[0];
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
