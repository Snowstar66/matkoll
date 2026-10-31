import { z } from "zod";
import { charLength } from "@/lib/one-line";
import { cleanPlaceName, maxPlaceNameChars } from "./thing-place";
import { appName } from "@/app/app-info";
import { thingNoun } from "./thing-noun";

// Ta kort (Story 18.11): where a card is taken. A room, and optionally a part of
// it or a box; without either the card goes to the room's "Hela rummet" place.
// Pure.

const name = z
  .string()
  .transform(cleanPlaceName)
  .refine((value) => charLength(value) <= maxPlaceNameChars, "too long");

export const captureInputSchema = z.object({
  siteId: z.uuid(),
  room: name.refine((value) => value.length > 0, "empty"),
  part: name.transform((value) => (value === "" ? null : value)),
  /** The part is a box's name. */
  box: z.boolean(),
});
export type CaptureInput = z.input<typeof captureInputSchema>;

export const captureTitle = "Var tar du kortet?";
export const takeCardText = "Ta kort";
export const takeCardSubText = "Fota ett rum, en hylla eller en låda";
export const moreCardsText = "Ta fler kort";
export const openCameraText = "\u{1F4F7} Ta foto";
export const pickImagesText = "\u{1F5BC}\uFE0F Välj från Bilder";
/** The file types the picker takes: a HEIC from an iPhone has no `image/*` type in every browser. */
export const pickerAccept = "image/*,.heic,.heif";
export const roomExactText = "Mer exakt plats …";
export const captureHintText = `Efter varje kort: "Ta ett till". ${appName} läser korten i bakgrunden.`;
export const exactPlaceText = "Mer exakt plats (valfritt)";
export const newRoomText = "+ Nytt rum";
// The "Nytt rum" sheet on Förråd's start page (Story 18.21).
export const newRoomTitle = "Nytt rum";
export const newRoomLabel = "Namn på rummet";
export const newRoomExample = "Garaget";
export const newRoomHint = "Sedan fotar du rummet, en hylla eller en låda där.";
export const createRoomText = "Skapa rum";
export const takeAnotherText = "Ta ett till";
export const emptyCaptureRoomText = "Ange ett rum, till exempel Skräpförrådet.";
export const retakeText = "Ta om";
export const retakeTitleText = "Ta om kortet";
export const retakeDetailText = `Det nya fotot ersätter det här kortet när det är läst. Rättelser och tillagda ${thingNoun.plural} på det gamla kortet ersätts av den nya läsningen.`;

/** The calm line for an image that could not be turned into JPEG: its name and what to do. */
export function skippedImageText(name: string): string {
  return `${name}: bilden gick inte att göra om från HEIC. Välj en annan bild eller ta ett nytt foto.`;
}

/** "Skickar 2 av 5 …". */
export function sendingText(done: number, total: number): string {
  return total <= 1 ? "Skickar kortet …" : `Skickar ${Math.min(done + 1, total)} av ${total} …`;
}

/** What is said after the cards are sent: they are read in the background. */
export function sentText(count: number): string {
  return count === 1 ? "Kortet läses i bakgrunden." : `${count} kort läses i bakgrunden.`;
}
