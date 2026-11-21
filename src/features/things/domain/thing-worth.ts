import { z } from "zod";

// Värt en titt (Tillval, Förråd): while a card is read the AI may flag the few föremål that may be
// collectible or worth more than they look, with one short sentence and how sure it is. It is a
// tip, never a valuation: no price anywhere. thing_item keeps the sentence and the confidence in
// two columns (both or neither). Pure.

export const worthConfidences = ["sure", "guess", "unsure"] as const;
export type WorthConfidence = (typeof worthConfidences)[number];

/** A föremål's tip: why it may be worth a closer look, and how sure the model was. */
export type ThingWorth = { why: string; confidence: WorthConfidence };

/** The two columns of a thing_item row as a tip, or `null` when it has none (or they are not a tip). */
export function worthOfRow(row: { worth_why?: string | null; worth_confidence?: string | null }): ThingWorth | null {
  const why = row.worth_why?.trim();
  const confidence = row.worth_confidence;
  if (!why || !(worthConfidences as readonly string[]).includes(confidence ?? "")) return null;
  return { why, confidence: confidence as WorthConfidence };
}

/** The two row columns as a zod shape, tolerant of a row without them (a missing column is no tip). */
export const worthRowShape = {
  worth_why: z.string().nullable().optional(),
  worth_confidence: z.string().nullable().optional(),
};

export const worthTitleText = "Värt en titt";
export const worthDisclaimerText = "Ett tips, inte en värdering.";

const confidenceWords: Record<WorthConfidence, string> = { sure: "Säker", guess: "Gissning", unsure: "Osäker" };

/** "Säker", "Gissning" or "Osäker". */
export function worthConfidenceText(confidence: WorthConfidence): string {
  return confidenceWords[confidence];
}

/** What a screen reader says for the marker on a row: "Värt en titt, gissning". */
export function worthMarkerLabel(worth: ThingWorth): string {
  return `${worthTitleText}, ${confidenceWords[worth.confidence].toLowerCase()}`;
}
