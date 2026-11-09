import { z } from "zod";

// What a suggestion says about the household's food preferences ("Anna undviker koriander", "Anna älskar paprika"):
// short notes worked out by the server (menu-advisor.foodFit) and shown under the suggestion. Left out when empty, so
// a household without preferences sees nothing extra.
export const fitNoteSchema = z.object({
  kind: z.enum(["allergy", "dislike", "like"]),
  text: z.string().min(1).max(160),
});

/** At most this many notes on one suggestion. */
export const maxFitNotes = 6;

export const fitNotesSchema = z.array(fitNoteSchema).max(maxFitNotes).optional();
