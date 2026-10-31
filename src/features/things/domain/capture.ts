import { z } from "zod";
import { charLength } from "@/lib/one-line";
import { cleanPlaceName, maxPlaceNameChars } from "./thing-place";
import { appName } from "@/app/app-info";

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
export const openCameraText = "\u{1F4F7} Öppna kameran";
export const pickImagesText = "Välj bilder …";
export const captureHintText = `Efter varje kort: "Ta ett till". ${appName} läser korten i bakgrunden.`;
export const exactPlaceText = "Mer exakt plats (valfritt)";
export const newRoomText = "+ Nytt rum";
export const takeAnotherText = "Ta ett till";
export const emptyCaptureRoomText = "Ange ett rum, till exempel Skräpförrådet.";
export const retakeText = "Ta om";
export const retakeTitleText = "Ta om kortet";
export const retakeDetailText = "Det nya fotot ersätter det här kortet när det är läst. Rättelser och tillagda prylar på det gamla kortet ersätts av den nya läsningen.";

/** "Skickar 2 av 5 …". */
export function sendingText(done: number, total: number): string {
  return total <= 1 ? "Skickar kortet …" : `Skickar ${Math.min(done + 1, total)} av ${total} …`;
}

/** What is said after the cards are sent: they are read in the background. */
export function sentText(count: number): string {
  return count === 1 ? "Kortet läses i bakgrunden." : `${count} kort läses i bakgrunden.`;
}
