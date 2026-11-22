import { thingCategories, type Thing, type ThingCategory } from "./thing";
import { seenOnText } from "./thing-merge";
import { shortDateText } from "./thing-photo";
import { inBoxText, normalizePlaceName } from "./thing-place";
import { thingCountText } from "./thing-noun";
import { notedHint } from "./thing-noted";

// Rummets överblick (Stories 18.11 and 18.12): a room is the distinct room of a
// boende's places; its things, categories and cards are the sum of all its
// places (parts, the whole room and boxes). The counts come from the database
// (thing_room_stats and thing_room_categories), so no page loads every thing.
// Pure.

/** The key of a room in the address and in the database (room_key). */
export function roomKey(room: string): string {
  return normalizePlaceName(room);
}

/** A room as the start page lists it. */
export type RoomSummary = {
  room: string;
  key: string;
  /** Kept things on the room's finished cards. */
  things: number;
  /** Finished cards. */
  cards: number;
  /** Cards being read. */
  reading: number;
  latest: Date | null;
  /** Värdetips: kept föremål with a star (a count over the room's rows, no column of its own); missing counts as none. */
  starred?: number;
};

/** "74 prylar", or "1 pryl". */
export function thingsText(count: number): string {
  return thingCountText(count);
}

/** "9 kort", or "1 kort". */
export function cardsText(count: number): string {
  return `${count} kort`;
}

/** The parts of the line under a room on the start page: ["74 prylar", "9 kort", "31 okt"]. The star count goes after the first (RoomMeta). */
export function roomMetaParts(room: RoomSummary): string[] {
  // A room with only written things (Story 18.13) has things and no card.
  if (room.cards === 0 && room.things > 0) return [thingsText(room.things)];
  if (room.cards === 0) return [room.reading > 0 ? "Tittar på kortet …" : "Inget kort än"];
  return [thingsText(room.things), cardsText(room.cards), room.latest ? shortDateText(room.latest) : null].filter((part): part is string => Boolean(part));
}

/** The line under a room on the start page: "74 prylar · 9 kort · 31 okt". */
export function roomMeta(room: RoomSummary): string {
  return roomMetaParts(room).join(" · ");
}

/**
 * Whether Förråd's start page has "Sök eller fråga" (Story 18.19): whenever the
 * boende has a room, also before any föremål, so "Kom ihåg" can be the first
 * thing written in. A boende without rooms has the empty state instead.
 */
export function showsFinder(rooms: readonly RoomSummary[]): boolean {
  return rooms.length > 0;
}

/** The sum above the rooms: "3 rum · 112 prylar". */
export function roomsTotalText(rooms: readonly RoomSummary[]): string {
  return `${rooms.length === 1 ? "1 rum" : `${rooms.length} rum`} · ${thingsText(rooms.reduce((sum, room) => sum + room.things, 0))}`;
}

/** The emoji and tile of a room on the start page, by what its name says; any other room is a box on sand. */
export function roomTile(room: string): { icon: string; tile: string } {
  const name = normalizePlaceName(room);
  if (/garage|bil/.test(name)) return { icon: "\u{1F697}", tile: "bg-tile-clay" };
  if (/bod|trädgård|växthus|uthus|stuga/.test(name)) return { icon: "\u{1F33F}", tile: "bg-mint" };
  if (/kök|skafferi|matrum/.test(name)) return { icon: "\u{1F373}", tile: "bg-sky" };
  if (/källare|vind|loft/.test(name)) return { icon: "\u{1F9F0}", tile: "bg-tile-lilac" };
  return { icon: "\u{1F4E6}", tile: "bg-sand" };
}

/** What a card shows: "Hela rummet", a part's name, or "Låda: Black box". */
export function cardLabel(place: { part: string | null; kind: "part" | "box" }): string {
  if (place.kind === "box" && place.part) return `Låda: ${place.part}`;
  return place.part ?? "Hela rummet";
}

/** The line under a card's label: "26 prylar · 31 okt". */
export function cardMeta(card: { things: number; takenAt: Date }): string {
  return `${thingsText(card.things)} · ${shortDateText(card.takenAt)}`;
}

/** The words next to a thing in the room's list: "i Blå backen" for a box, or "syns på 2 kort". Where on the photo is not shown here (Pontus 20 Nov): the photo says it. */
export function roomThingHint(thing: { kind: "part" | "box"; part: string | null; seenOn: number }): string | null {
  if (thing.kind === "box" && thing.part) return inBoxText(thing.part);
  return seenOnText(thing.seenOn);
}

/** A thing of the room's list, with its hint (as `whereHint`, so the row is the card's own). */
export function toRoomThing(row: {
  id: string;
  name: string;
  category: ThingCategory;
  confidence: Thing["confidence"];
  whereHint: string | null;
  part: string | null;
  kind: "part" | "box";
  seenOn: number;
  /** Story 18.19: when a noted thing was written in (ISO); null for any other thing. */
  notedAt?: string | null;
  /** Story 18.23: how many there are; null when it is not counted. */
  quantity?: number | null;
}): Thing {
  const quantity = row.quantity ?? null;
  if (row.notedAt) {
    // A noted thing says its part and the day it was written in, and keeps its own (empty) "where" for the sheet.
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      confidence: row.confidence,
      whereHint: notedHint(row.part, new Date(row.notedAt)),
      seenOn: 1,
      noted: { at: row.notedAt, part: row.part },
      quantity,
    };
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    confidence: row.confidence,
    whereHint: roomThingHint(row),
    seenOn: 1,
    quantity,
  };
}

/** The room's categories in the order of thingCategories, empty ones left out. */
export function orderCategories(rows: readonly { category: string; things: number }[]): { category: ThingCategory; things: number }[] {
  return thingCategories.flatMap((category) => {
    const things = rows.find((row) => row.category === category)?.things ?? 0;
    return things > 0 ? [{ category, things }] : [];
  });
}

/** "Skruv & beslag · 214": a category's heading text for a screen reader. */
export function categoryToggleLabel(category: string, count: number): string {
  return `${category} · ${count}`;
}

/** A card of the room as the Kort view shows it. */
export type RoomCard = {
  id: string;
  placeId: string;
  label: string;
  status: "reading" | "done" | "failed";
  things: number;
  takenAt: Date;
  errorCode: string | null;
  unseenNote: string | null;
  unseenCount: number;
  /** Värdetips: how many of the card's föremål have a star; missing counts as none. */
  starred?: number;
  /** What the card shows ("Hela rummet"), also when `label` is a name of the card's own (user_title or the AI's short name). */
  placeLabel?: string;
  /** The AI's line about what the card holds; null or missing when none. */
  summary?: string | null;
  /** The card's own name: the user's, else the AI's short one; null or missing when it has none. */
  title?: string | null;
  /** The card has a name of its own (the user's or the AI's), shown as `label`. */
  named?: boolean;
};

/** The room's page titles: the tabs of the segmented control. */
export const roomViews = ["things", "cards"] as const;
export type RoomView = (typeof roomViews)[number];

/** How the room's list is grouped (Pontus 20 Nov): per photo (the first choice) or per category. */
export const roomGroupings = ["photo", "category"] as const;
export type RoomGrouping = (typeof roomGroupings)[number];

export function parseRoomGrouping(value: string | null | undefined): RoomGrouping {
  return value === "category" ? "category" : "photo";
}

/** The things of a room per card, for the per-photo list: each card's own things, and the ones written in without a card. */
export type RoomPhotoThings = { byPhoto: Record<string, Thing[]>; noted: Thing[] };

export function parseRoomView(value: string | null | undefined): RoomView {
  return value === "cards" ? "cards" : "things";
}
