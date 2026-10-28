import { z } from "zod";
import { locationSchema } from "@/features/catalog";
import { analyzeResultSchema, maxPantrySuggestions, pantrySuggestionSchema } from "./pantry-suggestion";
import { locateResultSchema, readingSchema } from "./photo-numbers";
import { photoSiteSchema } from "./site";

// What the AI job of a photo (Story 12.5, AD-28) keeps as its result and what
// GET /api/ai/jobs/[id] gives back. The job keeps the reading: the place, the
// suggestions as the photo gave them (outside any comparison), the ingredients
// the AI named and whether the comparison must say it is incomplete. The
// comparison with the place's items is made when the result is fetched, so it
// is true when Pontus opens it. Never the photo.

/** How the numbers on the photo went: not yet (`null`), the points, or why there are none. */
export const photoPointsSchema = z.union([locateResultSchema, z.literal("failed"), z.literal("skipped")]).nullable();
export type PhotoPoints = z.infer<typeof photoPointsSchema>;

export const storedReadingSchema = z.object({
  site: photoSiteSchema.nullable(),
  location: locationSchema,
  suggestions: z.array(pantrySuggestionSchema).max(maxPantrySuggestions),
  dropped: z.number().int().min(0),
  /** The catalog ingredients the AI named, also those whose suggestion was left out: never "Syns inte längre". */
  seen: z.array(z.uuid()).max(200),
  incomplete: z.boolean(),
  reading: readingSchema.optional(),
  points: photoPointsSchema,
});
export type StoredReading = z.infer<typeof storedReadingSchema>;

/** What the client gets: the answer of the old analysis, and how the numbers went. */
export const photoJobResultSchema = analyzeResultSchema.extend({ points: photoPointsSchema });
export type PhotoJobResult = z.infer<typeof photoJobResultSchema>;
