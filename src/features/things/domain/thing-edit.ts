import { z } from "zod";
import { charLength, oneLine } from "@/lib/one-line";
import { thingCategories, thingConfidences } from "./thing";
import { thingPhotoMediaTypes } from "./thing-photo";
import { thingNoun } from "./thing-noun";

// Förnya och ta bort (Story 18.3): removing a card, a thing, and renaming a
// thing. A removal gives back a snapshot of what it took, so "Ångra" can put
// the rows back with the same ids. Pure.

/** The longest name of a thing, in characters, as thing_item_name_check counts them. */
export const maxThingNameChars = 80;

/** A name as typed, cleaned for storing: one line, trimmed, in Unicode NFC. */
export function cleanThingName(name: string): string {
  return oneLine(name).normalize("NFC");
}

export const renameInputSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .transform(cleanThingName)
    .refine((name) => name.length > 0, "empty")
    .refine((name) => charLength(name) <= maxThingNameChars, "too long"),
});
export type RenameInput = z.input<typeof renameInputSchema>;

/** The longest "where" of a thing, as thing_item_where_hint_check counts it. */
export const maxWhereChars = 120;

/** "Spara" in the sheet of a thing (Story 18.15): a name, a category and where on the picture; an empty "where" clears it. */
export const updateThingInputSchema = z.object({
  id: z.uuid(),
  name: renameInputSchema.shape.name,
  category: z.enum(thingCategories),
  whereHint: z
    .string()
    .nullable()
    .transform((text) => (text === null ? null : cleanThingName(text) || null))
    .refine((text) => text === null || charLength(text) <= maxWhereChars, "too long"),
});
export type UpdateThingInput = z.input<typeof updateThingInputSchema>;

/** A thing_item row as it was, for "Ångra". */
export const thingSnapshotSchema = z.object({
  id: z.uuid(),
  // Null for a noted thing (Story 18.19), which has no card.
  photoId: z.uuid().nullable(),
  placeId: z.uuid(),
  name: z.string().min(1).max(160),
  category: z.enum(thingCategories),
  whereHint: z.string().min(1).max(240).nullable(),
  confidence: z.enum(thingConfidences),
  position: z.number().int().min(0).max(1000),
  createdAt: z.iso.datetime({ offset: true }),
  // Story 18.6: the thing it was merged into, and the things that were merged into it, so "Ångra" does not bring duplicates back.
  sameAs: z.uuid().nullable().default(null),
  // Story 18.15: a thing typed onto its card comes back as one; Story 18.19: a noted thing as one, without a card.
  source: z.enum(["photo", "added", "noted"]).default("photo"),
  pointedBy: z.array(z.uuid()).max(200).default([]),
});
export type ThingSnapshot = z.output<typeof thingSnapshotSchema>;

/** A removed card as it was, with its things and the path of its file (which is kept until "Ångra" is out of time). */
export const cardSnapshotSchema = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  objectPath: z.string().min(1).max(300),
  mediaType: z.enum(thingPhotoMediaTypes),
  width: z.number().int().min(1).max(2064),
  height: z.number().int().min(1).max(2064),
  takenAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
  /** Story 18.16: a card that failed (or was stuck reading) comes back as failed, so "Försök igen" is there. */
  status: z.enum(["done", "failed"]).default("done"),
  errorCode: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/).nullable().default(null),
  unseenNote: z.string().min(1).max(300).nullable(),
  unseenCount: z.number().int().min(0).max(99),
  things: z.array(thingSnapshotSchema.extend({ photoId: z.uuid(), source: z.enum(["photo", "added"]).default("photo") })).max(200),
});
export type CardSnapshot = z.output<typeof cardSnapshotSchema>;

/** The path of a card's file as thing_photo_object_path_check has it: <user>/<place>/<card>.<jpg|png>. */
export const cardFilePathSchema = z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png)$/);

// The texts follow EXPERIENCE.md, Voice and Tone.

export const removeCardText = "Ta bort kortet";
export const removeCardQuestion = "Ta bort kortet?";
export const removeCardDetail = `Kortet, fotot och alla ${thingNoun.plural} som lästes från det tas bort. Platsen finns kvar.`;
export const removeThingText = `Ta bort ${thingNoun.singular}`;
export const renameThingText = "Byt namn";
export const categoryLabelText = "Kategori";
export const whereLabelText = "Var på bilden";
export const wherePlaceholderText = "Till exempel översta hyllan";
export const whereTooLongText = `Det får vara högst ${maxWhereChars} tecken.`;
export const emptyNameText = "Ange ett namn.";
export const nameTooLongText = `Namnet får vara högst ${maxThingNameChars} tecken.`;

/** "Tog bort kortet från 31 okt." */
export function removedCardText(dateText: string): string {
  return `Tog bort kortet från ${dateText}.`;
}

/** "Tog bort Hammare." */
export function removedThingText(name: string): string {
  return `Tog bort ${name}.`;
}
