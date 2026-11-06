import type { ThingBox } from "@/lib/thing-box";
import { shortDateText } from "./thing-photo";
import { normalizePlaceName } from "./thing-place";

// The boxes whose contents are not seen (Pontus 6 Nov): a card the AI read says
// how many closed boxes, bags and cabinets it saw (unseenCount). The ones it
// also named as föremål of the category "Förvaring & lådor", with a marker on
// the card, are listed on their own, each with its crop of the photo, so the
// row can say which boxes are meant and "Fota insidan" can start one at a time.
// Pure.

/** A closed box on a card: the föremål that names it, and where on which card it is. */
export type ClosedBox = {
  id: string;
  name: string;
  whereHint: string | null;
  cardId: string;
  /** The card's day, ISO. */
  takenAt: string;
  /** The marker on the card, or `null` when there is none. */
  box: ThingBox | null;
  /** The card's photo in pixels, so the crop keeps its proportions; 0 when not known. */
  photoWidth: number;
  photoHeight: number;
};

/** "3 lådor där innehållet inte syns", or "1 låda där innehållet inte syns". */
export function closedBoxesText(count: number): string {
  return `${count === 1 ? "1 låda" : `${count} lådor`} där innehållet inte syns`;
}

export const closedBoxesHintText = "Fota insidan så vet du vad som finns i dem.";
export const closedBoxesTitle = "Lådor där innehållet inte syns";
export const photographInsideText = "Fota insidan";

/** The line under a closed box's name: where it stands and the day of its card. */
export function closedBoxMeta(box: Pick<ClosedBox, "whereHint" | "takenAt">): string {
  return [box.whereHint, `Kort från ${shortDateText(new Date(box.takenAt))}`].filter(Boolean).join(" · ");
}

/** The closed boxes that do not have a box of their own in the room yet (by name), each name once. */
export function withoutOwnBox(boxes: readonly ClosedBox[], ownBoxNames: readonly (string | null)[]): ClosedBox[] {
  const taken = new Set(ownBoxNames.filter((name): name is string => name !== null).map(normalizePlaceName));
  const seen = new Set<string>();
  return boxes.filter((box) => {
    const key = normalizePlaceName(box.name);
    if (taken.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The crop of a card's photo around a marker, as percentages of the crop's own frame: `aspect` is the frame's width over its height. */
export function cropStyle(box: ThingBox, photoWidth: number, photoHeight: number): { aspect: number; left: string; top: string; width: string; height: string } {
  const percent = (value: number) => `${Math.round(value * 10_000) / 100}%`;
  const ratio = photoWidth > 0 && photoHeight > 0 ? photoWidth / photoHeight : 1;
  return {
    aspect: (box.width / box.height) * ratio,
    left: percent(-box.left / box.width),
    top: percent(-box.top / box.height),
    width: percent(1 / box.width),
    height: percent(1 / box.height),
  };
}
