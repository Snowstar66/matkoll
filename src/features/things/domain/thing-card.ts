import { z } from "zod";
import { isValidBox, type ThingBox } from "@/lib/thing-box";
import { thingCountText, thingNoun } from "./thing-noun";
import { cardDateText } from "./thing-photo";
import type { ThingCategory, ThingConfidence } from "./thing";

// Kortet i stort (Story 18.7): a card's whole photo with a box round each
// föremål that has one, and the föremål listed under it. A search hit or a
// chat reference opens it with its föremål marked (`?foremal=`), and the room's
// Kort tab opens it with nothing marked. Pure.

export type { ThingBox };

/** A föremål on the card as the big view shows it. */
export type CardThing = {
  id: string;
  name: string;
  /** For its sheet (Pontus 1 Nov), opened from its row. */
  category: ThingCategory;
  confidence: ThingConfidence;
  whereHint: string | null;
  /** Where on the photo, 0 to 1; null when the reading gave none (an older card) or it was not reasonable. */
  box: ThingBox | null;
  /** A lookup found nothing: it is not looked for again. */
  boxMissed: boolean;
  /** Story 18.23: how many the card shows ("5 st"); null or missing when it is not counted. */
  quantity?: number | null;
};

/** A card as the big view shows it. Plain data: it crosses from the server to the browser. */
export type CardView = {
  id: string;
  placeId: string;
  siteId: string;
  room: string;
  roomKey: string;
  part: string | null;
  kind: "part" | "box";
  status: "reading" | "done" | "failed";
  /** When the card was taken (ISO). */
  takenAt: string;
  width: number;
  height: number;
  things: CardThing[];
};

/** The four box columns of a thing_item row as a box, or `null` when it has none or they do not make one. */
export function boxOfRow(row: { box_left: number | null; box_top: number | null; box_width: number | null; box_height: number | null }): ThingBox | null {
  const { box_left: left, box_top: top, box_width: width, box_height: height } = row;
  if (left === null || top === null || width === null || height === null) return null;
  const box = { left, top, width, height };
  return isValidBox(box) ? box : null;
}

/** The box columns of a thing_item row to insert, for "Ångra": the box, or that a lookup found nothing. */
export function boxColumnsOf(thing: { box: ThingBox | null; boxMissed: boolean }): {
  box_left: number | null;
  box_top: number | null;
  box_width: number | null;
  box_height: number | null;
  box_missed: boolean;
} {
  const { box } = thing;
  return {
    box_left: box?.left ?? null,
    box_top: box?.top ?? null,
    box_width: box?.width ?? null,
    box_height: box?.height ?? null,
    box_missed: box === null && thing.boxMissed,
  };
}

/** A box as it is sent to save_thing_card or stored: only the four numbers. */
export const thingBoxSchema = z
  .object({ left: z.number(), top: z.number(), width: z.number(), height: z.number() })
  .refine((box) => isValidBox(box), "not a box");

/** Where a card opens big; with `thingId`, with that föremål marked. */
export function cardViewHref(cardId: string, thingId?: string | null): string {
  return thingId ? `/prylar/kort/${cardId}?foremal=${thingId}` : `/prylar/kort/${cardId}`;
}

/** The big view's title: the room for a card of the whole room, the part, or "Låda: Black box". */
export function cardViewTitle(card: Pick<CardView, "room" | "part" | "kind">): string {
  if (card.kind === "box" && card.part) return `Låda: ${card.part}`;
  return card.part ?? card.room;
}

/** The line under the title: "Hela rummet · Kort från 30 okt · 12 föremål", or "Boden · …" for a part or a box. */
export function cardViewMeta(card: Pick<CardView, "room" | "part" | "takenAt"> & { things: readonly unknown[] }): string {
  return [card.part ? card.room : "Hela rummet", cardDateText(new Date(card.takenAt)), thingCountText(card.things.length)].join(" · ");
}

/** The line under the photo when nothing is marked: how to mark, or how to look one up on a card without boxes. */
export function cardHintText(things: readonly Pick<CardThing, "box">[]): string {
  return things.some((thing) => thing.box !== null)
    ? `Tryck på ${thingNoun.indefinite} eller en ruta för att markera det.`
    : `Tryck på ${thingNoun.indefinite} för att leta upp det på bilden.`;
}

/** The line under the photo for a marked föremål: "Hammare · på väggen, mitten". */
export function markedText(thing: Pick<CardThing, "name" | "whereHint">): string {
  return thing.whereHint ? `${thing.name} · ${thing.whereHint}` : thing.name;
}

export const lookingText = "Letar …";
export const notFoundOnCardText = "Kunde inte peka ut den på bilden.";
export const cardReadingText = "Kortet läses fortfarande.";
export const cardFailedViewText = "Kortet kunde inte läsas. Försök igen från rummet.";

/**
 * The föremål whose box contains the point (0 to 1), the smallest one when
 * boxes overlap (a thing on a shelf is inside the shelf's box), or `null`.
 */
export function thingAtPoint<T extends Pick<CardThing, "box">>(things: readonly T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bestArea = Infinity;
  for (const thing of things) {
    const box = thing.box;
    if (!box || x < box.left || x > box.left + box.width || y < box.top || y > box.top + box.height) continue;
    const area = box.width * box.height;
    if (area < bestArea) {
      best = thing;
      bestArea = area;
    }
  }
  return best;
}
