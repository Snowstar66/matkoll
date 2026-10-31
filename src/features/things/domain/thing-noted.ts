import { z } from "zod";
import { charLength } from "@/lib/one-line";
import { thingCategories, type ThingCategory } from "./thing";
import { cleanThingName, maxThingNameChars } from "./thing-edit";
import { shortDateText } from "./thing-photo";
import { cleanPlaceName, maxPlaceNameChars, normalizePlaceName } from "./thing-place";

// "Kom ihåg var jag lade den" (Story 18.19): Pontus writes in the chat where
// something is ("Passen ligger i översta byrålådan i sovrummet"); the AI
// proposes the thing, the room and the part, and one tap saves it as a thing
// without a card or photo (source 'noted'), in a part of the room. Later the
// chat, the search and the room show it, with the day he wrote it in. Pure.

/** A room of the boende with its parts (not its boxes), as the proposal matches against them. */
export type RoomParts = { room: string; parts: string[] };

/** What the chat proposes to remember. Plain data: it crosses from the server to the browser. */
export type NotedProposal = {
  name: string;
  /** The room, spelled as the boende has it when it exists; null when the text named none. */
  room: string | null;
  /** The part of the room, spelled as the room has it when it exists; null for the whole room. */
  part: string | null;
  category: ThingCategory;
  /** The room is not in the boende yet: saving makes it. */
  newRoom: boolean;
  /** The noted thing of the same name it moves (it is removed when this is saved). */
  moves: { id: string; title: string; notedAt: string } | null;
};

/** "Översta byrålådan": the first letter a capital, the rest as written. */
export function capitalizeFirst(text: string): string {
  const [first = "", ...rest] = [...text];
  return first.toLocaleUpperCase("sv") + rest.join("");
}

/** A room's key without a Swedish definite ending, so "Sovrum" finds "Sovrummet" and "Garage" finds "Garaget". */
function stem(key: string): string {
  return key.replace(/(?:met|et|en|n|e)$/u, "");
}

/** The room of `rooms` that `name` means: the same key, or else the only one with the same stem. */
export function matchRoom<T extends { room: string }>(rooms: readonly T[], name: string): T | null {
  const key = normalizePlaceName(name);
  const exact = rooms.find((entry) => normalizePlaceName(entry.room) === key);
  if (exact) return exact;
  // Either side may be the base form: "Altan" and "Altanen", "Sovrum" and "Sovrummet".
  const same = (a: string, b: string) => stem(a) === stem(b) || stem(a) === b || a === stem(b);
  const loose = rooms.filter((entry) => same(normalizePlaceName(entry.room), key));
  return loose.length === 1 ? loose[0] : null;
}

/**
 * Where the proposed thing goes: the boende's own room and part when they
 * exist in another spelling, otherwise the names with a capital first letter,
 * and whether the room is new. A room the text did not name stays null.
 */
export function proposePlace(rooms: readonly RoomParts[], proposed: { room: string | null; part: string | null }): Pick<NotedProposal, "room" | "part" | "newRoom"> {
  const part = proposed.part ? cleanPlaceName(proposed.part) : "";
  if (!proposed.room || cleanPlaceName(proposed.room) === "") return { room: null, part: part === "" ? null : capitalizeFirst(part), newRoom: false };
  const known = matchRoom(rooms, proposed.room);
  const room = known?.room ?? capitalizeFirst(cleanPlaceName(proposed.room));
  if (part === "") return { room, part: null, newRoom: !known };
  const knownPart = known?.parts.find((name) => normalizePlaceName(name) === normalizePlaceName(part));
  return { room, part: knownPart ?? capitalizeFirst(part), newRoom: !known };
}

/** "Sovrummet · Översta byrålådan", or the room alone. */
export function notedTitle(place: { room: string; part: string | null }): string {
  return place.part ? `${place.room} · ${place.part}` : place.room;
}

const nameField = z
  .string()
  .transform(cleanThingName)
  .refine((name) => name.length > 0, "empty")
  .refine((name) => charLength(name) <= maxThingNameChars, "too long");

const roomField = z
  .string()
  .transform(cleanPlaceName)
  .refine((name) => name.length > 0, "empty")
  .refine((name) => charLength(name) <= maxPlaceNameChars, "too long");

/** What "Kom ihåg" sends: the boende, the thing, where it is, its category and the noted thing it moves. */
export const rememberInputSchema = z.object({
  siteId: z.uuid(),
  name: nameField,
  room: roomField,
  part: z
    .string()
    .nullable()
    .transform((name) => (name === null ? "" : cleanPlaceName(name)))
    .refine((name) => charLength(name) <= maxPlaceNameChars, "too long")
    .transform((name) => (name === "" ? null : name)),
  category: z.enum(thingCategories),
  replaces: z.uuid().nullable(),
});
export type RememberInput = z.input<typeof rememberInputSchema>;

/** What a saved noted thing answers with: where it is and the room's address. */
export type Remembered = { id: string; title: string; href: string; notedAt: string };

// The texts follow EXPERIENCE.md, Voice and Tone.

export const proposalQuestionText = "Ska jag komma ihåg var det ligger?";
export const rememberText = "Kom ihåg";
export const savingNotedText = "Sparar …";
export const editProposalText = "Ändra";
export const chooseRoomText = "Välj rum";
export const newRoomBadgeText = "nytt rum";
export const notedNameLabel = "Föremål";
export const notedRoomLabel = "Rum";
export const yourRoomsLabel = "Dina rum";
export const notedPartLabel = "Del av rummet";
export const optionalText = "(valfritt)";
export const notedPartPlaceholder = "Till exempel översta lådan";
export const notedSaveFailedText = "Det gick inte att spara. Försök igen.";
/** The note shown instead of a photo for a thing written in by hand. */
export const notedIcon = "\u{1F4DD}";

/** "Du skrev in det 31 okt". */
export function notedSubText(date: Date): string {
  return `Du skrev in det ${shortDateText(date)}`;
}

/** "Låg förut i Köket · Kroken (skrivet 12 okt)." */
export function movedFromText(moves: { title: string; notedAt: string }): string {
  return `Låg förut i ${moves.title} (skrivet ${shortDateText(new Date(moves.notedAt))}).`;
}

/** "Klart. Pass ligger i Sovrummet · Översta byrålådan." */
export function rememberedText(name: string, title: string): string {
  return `Klart. ${name} ligger i ${title}.`;
}

/** The words next to a noted thing in its room's list: "Översta byrålådan · skrivet 31 okt". */
export function notedHint(part: string | null, notedAt: Date): string {
  return [part, `skrivet ${shortDateText(notedAt)}`].filter(Boolean).join(" · ");
}

/** The line under the title of a noted thing's sheet: "Du skrev in det 31 okt · Översta byrålådan". */
export function notedSheetSubtitle(part: string | null, notedAt: Date): string {
  return [notedSubText(notedAt), part].filter(Boolean).join(" · ");
}
