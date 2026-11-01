import { z } from "zod";
import { seenOnText } from "./thing-merge";

// A thing the AI read from a card (Story 18.2): name, category, where in the
// photo and how sure. Things never touch food: no list, no recipe, no pantry.
// Pure.

/** The categories, as thing_item_category_check lists them; the AI port keeps the same list (src/server/ai/schemas.ts). */
export const thingCategories = [
  "Verktyg",
  "Sport & fritid",
  "Trädgård",
  "Elektronik",
  "Förvaring & lådor",
  "Kläder & textil",
  "Hushåll",
  "Byggmaterial",
  "Övrigt",
] as const;
export type ThingCategory = (typeof thingCategories)[number];

export const thingConfidences = ["high", "medium", "low"] as const;
export type ThingConfidence = (typeof thingConfidences)[number];

/**
 * The emoji and tile of each category, as the approved look has them (an
 * emoji on a light tile; both decoration, the name always stands beside
 * them). Övrigt ends in the invisible variation selector, so it is an escape.
 */
export const thingTiles = {
  Verktyg: { icon: "\u{1F528}", tile: "bg-sand" },
  "Sport & fritid": { icon: "⚽", tile: "bg-mint" },
  Trädgård: { icon: "\u{1F331}", tile: "bg-mint" },
  Elektronik: { icon: "\u{1F50C}", tile: "bg-sky" },
  "Förvaring & lådor": { icon: "\u{1F4E6}", tile: "bg-tile-clay" },
  "Kläder & textil": { icon: "\u{1F9E5}", tile: "bg-tile-lilac" },
  Hushåll: { icon: "\u{1F9F9}", tile: "bg-sky" },
  Byggmaterial: { icon: "\u{1F9F1}", tile: "bg-sand" },
  Övrigt: { icon: "\u{1F6CD}️", tile: "bg-border" },
} as const satisfies Record<ThingCategory, { icon: string; tile: string }>;

/** A thing as the place page shows it. */
export type Thing = {
  id: string;
  name: string;
  category: ThingCategory;
  whereHint: string | null;
  confidence: ThingConfidence;
  /** On how many cards of the room it is seen (Story 18.6): 1 for a thing on one card. */
  seenOn: number;
  /** Story 18.19: written in by hand with where it is (no card): when (ISO), and the part of the room it is in. */
  noted?: { at: string; part: string | null } | null;
  /** Story 18.23: how many there are; null or missing when it is not counted. */
  quantity?: number | null;
};

/** A thing_item row as read, checked before the page shows it. */
export const thingRowSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  category: z.enum(thingCategories),
  where_hint: z.string().nullable(),
  confidence: z.enum(thingConfidences),
  position: z.number().int(),
});

export function toThing(row: z.output<typeof thingRowSchema>, seenOn = 1): Thing {
  return { id: row.id, name: row.name, category: row.category, whereHint: row.where_hint, confidence: row.confidence, seenOn };
}

/** The things under their categories, in the order of thingCategories, each group in the model's order; empty groups are left out. */
export function groupByCategory<T extends { category: ThingCategory }>(things: readonly T[]): { category: ThingCategory; things: T[] }[] {
  return thingCategories
    .map((category) => ({ category, things: things.filter((thing) => thing.category === category) }))
    .filter((group) => group.things.length > 0);
}

/** A thing the model was not sure of shows as "kanske". */
export function isMaybe(thing: Pick<Thing, "confidence">): boolean {
  return thing.confidence === "low";
}

/** The mark on an unsure thing. */
export const maybeText = "kanske";

/** The row under a thing's name: where in the photo, with "kanske" first when it is a guess and "syns på 2 kort" last when the room's cards overlap on it. */
export function thingMeta(thing: Pick<Thing, "confidence" | "whereHint"> & { seenOn?: number }): string {
  return [isMaybe(thing) ? maybeText : null, thing.whereHint, seenOnText(thing.seenOn ?? 1)].filter(Boolean).join(" · ");
}

/** "Innehållet i 3 lådor syns inte – fota insidan", or the model's own sentence when it gave no count, or nothing. */
export function unseenText(count: number, note: string | null): string | null {
  if (count > 0) return `Innehållet i ${count === 1 ? "1 låda" : `${count} lådor`} syns inte – fota insidan`;
  return note;
}

/** "Prylarna från kortet" counts, for the section title. */
export function categoryCountText(count: number): string {
  return count === 1 ? "1 sak" : `${count} saker`;
}
