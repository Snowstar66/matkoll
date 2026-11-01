import { z } from "zod";
import { charLength } from "@/lib/one-line";
import { cardsText, thingsText } from "./thing-room";
import { cleanPlaceName, maxPlaceNameChars } from "./thing-place";
import { thingNoun } from "./thing-noun";

// Rätta rum och delar (Story 18.16): rename a room (merging it into a room that
// has the name already, after a question), rename a part or a box, and remove a
// part or a box with its cards, files and things. Pure.

const nameField = z
  .string()
  .transform(cleanPlaceName)
  .refine((value) => value.length > 0, "empty")
  .refine((value) => charLength(value) <= maxPlaceNameChars, "too long");

export const renameRoomInputSchema = z.object({
  siteId: z.uuid(),
  roomKey: z.string().min(1).max(160),
  name: nameField,
  /** The user has said yes to merging into the room that has the name. */
  merge: z.boolean(),
});
export type RenameRoomInput = z.input<typeof renameRoomInputSchema>;

export const renamePlaceInputSchema = z.object({ placeId: z.uuid(), name: nameField });
export type RenamePlaceInput = z.input<typeof renamePlaceInputSchema>;

export const removePlaceInputSchema = z.object({ placeId: z.uuid() });

/** What renaming a room did: it is `renamed` (to the room with this key, which the page's address then has), or the name is another room's and the user is asked (`exists`). */
export type RenamedRoom = { kind: "renamed"; key: string; room: string; merged: boolean } | { kind: "exists"; room: string };

/** What removing a part or a box takes with it. */
export type PlaceCounts = { things: number; cards: number };

export const renameRoomMenuText = "Byt namn på rummet";
export const renameMenuText = "Byt namn";
export const removeMenuText = "Ta bort";
export const renameRoomLabelText = "Rummets namn";
export const renameSaveText = "Spara";
export const renamingText = "Sparar …";
export const mergeConfirmText = "Slå ihop rummen";
export const removingText = "Tar bort …";
export const emptyNewNameText = "Ange ett namn.";
export const placeNameTakenText = "Det finns redan en plats med det namnet i rummet.";

/** The title of the sheet that renames a part or a box: "Byt namn på lådan Blå backen". */
export function renamePlaceTitle(place: { part: string; box: boolean }): string {
  return place.box ? "Byt namn på lådan" : "Byt namn på delen";
}

/** What the sheet says when the new name is a room that is there already. */
export function mergeQuestionText(room: string): string {
  return `${room} finns redan. Vill du slå ihop rummen? Korten och ${thingNoun.definitePlural} hamnar i ${room}, och delar med samma namn blir en.`;
}

/** The lead of the remove sheet: "Det här tas bort: 12 prylar, 2 kort." */
export function removePlaceLeadText(counts: PlaceCounts): string {
  const parts = [counts.things > 0 ? thingsText(counts.things) : null, counts.cards > 0 ? cardsText(counts.cards) : null].filter(Boolean);
  return parts.length > 0 ? `Det här tas bort: ${parts.join(", ")}.` : `Det finns inga kort eller ${thingNoun.plural} här än.`;
}

export function removePlaceTitle(place: { part: string; box: boolean }): string {
  return place.box ? `Ta bort lådan ${place.part}?` : `Ta bort delen ${place.part}?`;
}

export function removePlaceDetailText(box: boolean): string {
  return `${box ? "Lådan" : "Delen"} tas bort med sina kort, foton och ${thingNoun.plural}. Det går inte att ångra.`;
}

/** The toast after a removal. */
export function placeRemovedText(part: string): string {
  return `${part} togs bort.`;
}

/** The toast after a merge of two rooms, or a rename. */
export function roomRenamedText(room: string, merged: boolean): string {
  return merged ? `Rummen slogs ihop till ${room}.` : `Rummet heter nu ${room}.`;
}
