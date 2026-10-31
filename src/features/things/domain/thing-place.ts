import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";

// Platser i Prylar (Story 18.1): a place has a name of its own, a room and an
// optional part ("Skräpförrådet", "Översta hyllan"), and belongs to one of the
// user's boenden (a pantry_site, which the Prylar tab shares with Lagersaldo).
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
  /** How many things the place's latest card has. */
  itemCount: number;
  /** When the latest finished card was taken, or null before there is one. */
  cardTakenAt: Date | null;
  /** The latest card is being read now, or its reading did not go. */
  cardState: "none" | "reading" | "failed" | "done";
};

/** The place's name as one line: "Skräpförrådet · Översta hyllan", or the room alone. */
export function placeTitle(place: Pick<ThingPlace, "room" | "part">): string {
  return place.part ? `${place.room} · ${place.part}` : place.room;
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

// The texts follow EXPERIENCE.md, Voice and Tone.

export const thingsEmptyText = "Fotografera en hylla eller ett förråd, så listar Matkoll vad som finns där.";
export const newPlaceText = "Ny plats";
export const emptyRoomText = "Ange ett rum, till exempel Skräpförrådet.";
export const nameTooLongText = `Namnet får vara högst ${maxPlaceNameChars} tecken.`;
export const placeTakenText = "Platsen finns redan.";
export const placeLimitText = `Du kan ha högst ${maxPlacesPerSite} platser i ett boende.`;

/** "12 saker" or "1 sak". */
export function thingCountText(count: number): string {
  return count === 1 ? "1 sak" : `${count} saker`;
}
