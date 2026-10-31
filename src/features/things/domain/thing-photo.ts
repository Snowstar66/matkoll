import { z } from "zod";
import type { ErrorCode } from "@/lib/errors";

// Kort i Prylar (Story 18.2): a card is a photo of a place. It goes to the
// private bucket thing-photo, one folder per account (AD-26), and an AI job
// reads the things from it in the background. Pure.

export const thingPhotoBucket = "thing-photo";
export const thingPhotoMediaTypes = ["image/jpeg", "image/png"] as const;
export type ThingPhotoMediaType = (typeof thingPhotoMediaTypes)[number];

/** The file's path: <user>/<place>/<photo id>.<jpg|png>, as thing_photo_object_path_check has it. */
export function thingPhotoPath(userId: string, placeId: string, id: string, mediaType: ThingPhotoMediaType): string {
  return `${userId}/${placeId}/${id}${mediaType === "image/jpeg" ? ".jpg" : ".png"}`;
}

/** A card's reading: the job is on it, it is done, or it did not go (the card stays). */
export const thingPhotoStatuses = ["reading", "done", "failed"] as const;
export type ThingPhotoStatus = (typeof thingPhotoStatuses)[number];

/** A card as the place page shows it: its row, never the image. */
export type ThingCard = {
  id: string;
  placeId: string;
  takenAt: Date;
  createdAt: Date;
  status: ThingPhotoStatus;
  errorCode: ErrorCode | null;
  unseenNote: string | null;
  unseenCount: number;
};

/**
 * A card that has been `reading` longer than this has lost its job (the
 * function died): it is shown as failed, so "Försök igen" is there. An AI job
 * has at most 295 s (AD-28).
 */
export const readingStaleMs = 6 * 60_000;

/** The state to show for a card: `reading` for too long is failed. */
export function shownStatus(card: Pick<ThingCard, "status" | "createdAt">, now: Date): ThingPhotoStatus {
  if (card.status === "reading" && now.getTime() - card.createdAt.getTime() > readingStaleMs) return "failed";
  return card.status;
}

/** The fields that come with the photo to POST /api/things/photo (AD-2): the place and when it was taken. The photo is checked by readImageForm. */
export const thingPhotoFormSchema = z.object({
  clientKey: z.uuid(),
  place: z.uuid(),
  takenAt: z.iso.datetime({ offset: true }).transform((text) => new Date(text)),
});
export type ThingPhotoForm = z.output<typeof thingPhotoFormSchema>;

/** A card's time at most a day before it was saved and never in the future, so a wrong clock never makes a card older than it is. */
export function clampTakenAt(takenAt: Date, now: Date): Date {
  const earliest = now.getTime() - 24 * 3_600_000;
  return new Date(Math.min(now.getTime(), Math.max(earliest, takenAt.getTime())));
}

const shortMonths = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** The day in Swedish time, as "31 okt". Fixed names, so the server and every browser write the same. */
export function shortDateText(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", month: "numeric", day: "numeric" })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return `${parts.day} ${shortMonths[parts.month - 1]}`;
}

/** "Kort från 31 okt". */
export function cardDateText(takenAt: Date): string {
  return `Kort från ${shortDateText(takenAt)}`;
}

/** The row that takes a card (the same quiet row as Förråd's): its title, and its line "Senaste kort 31 okt" or "Inget kort än". */
export const newCardText = "Ta ett nytt kort";
export function latestCardText(takenAt: Date | null): string {
  return takenAt ? `Senaste kort ${shortDateText(takenAt)}` : "Inget kort än";
}

export const cameraText = "Fotografera platsen";
export const pickText = "Välj bild";
export const readingText = "Tittar på bilden … Du kan göra annat under tiden.";
export const cardFailedText = "Det gick inte att läsa kortet. Det ligger kvar, så du kan försöka igen.";
export const retryText = "Försök igen";
export const noThingsText = "Inga prylar hittades på kortet. Prova med ett närmare kort.";

/** Why a card failed, in words; an unknown code is the AI being out of reach. */
export function cardFailureText(code: ErrorCode | null): string {
  if (code === "ai_invalid") return "Det gick inte att tolka svaret från AI:n. Kortet ligger kvar, så du kan försöka igen.";
  return cardFailedText;
}
