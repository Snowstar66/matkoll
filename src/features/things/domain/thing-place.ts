import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";

// Platser i Prylar (Story 18.1): a place has a name of its own, a room and an
// optional part ("Skräpförrådet", "Översta hyllan"), and belongs to one of the
// user's boenden (a pantry_site, which the Prylar tab shares with Förråd).
// No floor plan. Pure, so it is tested without a database; the table's
// checks (supabase/migrations/*_things.sql) follow the same rules.

/** The longest room or part, in characters (code points), as thing_place's checks count them. */
export const maxPlaceNameChars = 40;
/** The most places a boende may have: a sane limit for the list, not a rule of the table. */
export const maxPlacesPerSite = 60;

/**
 * A room or part as stored in the key columns: on one line with single
 * spaces, in Unicode NFC and lower case as Swedish has it, so "Skräpförrådet "
 * and "skräpförrådet" are the same room. Postgres never lowercases (its
 * lower() depends on the collation, as for pantry_site).
 */
export function normalizePlaceName(name: string): string {
  return oneLine(name).normalize("NFC").toLocaleLowerCase("sv");
}

/**
 * A box (Story 18.5) is a place under the same room whose part is the box's
 * name. Since Story 18.6 the column `thing_place.kind` says so ('part' or
 * 'box'); the `part_key` still carries this prefix on a box, so a box and a
 * part with the same name never clash and the key stays out of sight (the
 * shown `part` is the plain name), and the code before the column, which only
 * wrote the key, still makes boxes (a trigger gives them their kind). Kept at
 * most 160 characters by the table's check.
 */
export const boxKeyPrefix = "box:";

/** The `part_key` of a box named `name`. */
export function boxKey(name: string): string {
  return `${boxKeyPrefix}${normalizePlaceName(name)}`;
}

/** Whether a stored `part_key` is a box's. */
export function isBoxKey(partKey: string): boolean {
  return partKey.startsWith(boxKeyPrefix);
}

/** A name as typed, cleaned for storing: one line, trimmed. */
export function cleanPlaceName(name: string): string {
  return oneLine(name).normalize("NFC");
}

const nameField = z
  .string()
  .transform(cleanPlaceName)
  .refine((name) => name.length > 0, "empty")
  .refine((name) => charLength(name) <= maxPlaceNameChars, "too long");

/** What "Skapa" sends: the boende, the room and the optional part (empty is none). */
export const placeInputSchema = z.object({
  siteId: z.uuid(),
  room: nameField,
  part: z
    .string()
    .transform(cleanPlaceName)
    .refine((name) => charLength(name) <= maxPlaceNameChars, "too long")
    .transform((name) => (name === "" ? null : name)),
});
export type PlaceInput = z.input<typeof placeInputSchema>;
export type ValidPlaceInput = z.output<typeof placeInputSchema>;

/** A place as the list and the place page show it. */
export type ThingPlace = {
  id: string;
  siteId: string;
  room: string;
  part: string | null;
  /** A box in the room (Story 18.5): `part` is its name. */
  isBox: boolean;
  /** How many things the place's latest card has. */
  itemCount: number;
  /** How many of the latest card's things were merged into other cards of the room (Story 18.6): they are counted there. */
  mergedAway: number;
  /** When the latest finished card was taken, or null before there is one. */
  cardTakenAt: Date | null;
  /** The latest card is being read now, or its reading did not go. */
  cardState: "none" | "reading" | "failed" | "done";
};

/** The place's name as one line: "Skräpförrådet · Översta hyllan", or the room alone. */
export function placeTitle(place: { room: string; part: string | null; isBox?: boolean }): string {
  if (place.isBox && place.part) return `${place.room}, ${inBoxText(place.part)}`;
  return place.part ? `${place.room} · ${place.part}` : place.room;
}

/** "i Blå backen": how a thing in a box says where it is. */
export function inBoxText(boxName: string): string {
  return `i ${boxName}`;
}

/** The part's name in a list under its room: "Översta hyllan", or "Hela rummet" for a place without one. */
export function partLabel(place: Pick<ThingPlace, "part">): string {
  return place.part ?? "Hela rummet";
}

/** The places grouped by room, in the order the rooms were first made (the list is in creation order); the same room in another spelling is one group. */
export function groupByRoom(places: readonly ThingPlace[]): { room: string; places: ThingPlace[] }[] {
  const groups = new Map<string, { room: string; places: ThingPlace[] }>();
  for (const place of places) {
    const key = normalizePlaceName(place.room);
    const group = groups.get(key);
    if (group) group.places.push(place);
    else groups.set(key, { room: place.room, places: [place] });
  }
  return [...groups.values()];
}

/** The rooms the user already has, once each and sorted, for the suggestions in "Ny plats". */
export function roomSuggestions(places: readonly Pick<ThingPlace, "room">[]): string[] {
  const rooms = new Map<string, string>();
  for (const { room } of places) if (!rooms.has(normalizePlaceName(room))) rooms.set(normalizePlaceName(room), room);
  return [...rooms.values()].sort((a, b) => a.localeCompare(b, "sv"));
}

/** What "Lägg till" sends in the sheet Lägg till låda: the place it is added to and the box's name. */
export const boxInputSchema = z.object({ placeId: z.uuid(), name: nameField });
export type BoxInput = z.input<typeof boxInputSchema>;

// The texts follow EXPERIENCE.md, Voice and Tone.

export const thingsEmptyText = "Fotografera en hylla eller ett förråd, så listar Matkoll vad som finns där.";
export const newPlaceText = "Ny plats";
export const emptyRoomText = "Ange ett rum, till exempel Skräpförrådet.";
export const addBoxText = "Lägg till låda";
export const emptyBoxText = "Ange ett namn, till exempel Blå backen.";
export const boxTakenText = "Lådan finns redan.";
export const nameTooLongText = `Namnet får vara högst ${maxPlaceNameChars} tecken.`;
export const placeTakenText = "Platsen finns redan.";
export const placeLimitText = `Du kan ha högst ${maxPlacesPerSite} platser i ett boende.`;

/** What a place says when all of its card's things are seen on other cards of the room. */
export const allOnOtherCardsText = "Alla syns på andra kort";

/** "12 saker" or "1 sak". */
export function thingCountText(count: number): string {
  return count === 1 ? "1 sak" : `${count} saker`;
}
