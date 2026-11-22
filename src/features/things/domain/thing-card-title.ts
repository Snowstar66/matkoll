import { z } from "zod";

// The user's own name for a card ("Byt namn" in its ⋯): one line, at most maxCardTitleChars characters. Pure.

export const maxCardTitleChars = 40;
export const emptyCardTitleText = "Skriv ett namn.";
export const tooLongCardTitleText = `Namnet får vara högst ${maxCardTitleChars} tecken.`;

export const cardTitleSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .refine((value) => value !== "", "empty")
  .refine((value) => Array.from(value).length <= maxCardTitleChars, "too long");

/** The card's ⋯ row and sheet. */
export const renameCardText = "Byt namn";
export const renameCardLabelText = "Kortets namn";
export const updateSummaryText = "Uppdatera sammanfattningen";
export const updatingSummaryText = "Uppdaterar …";
export const summaryFailedText = "Det gick inte att uppdatera just nu. Försök igen om en stund.";
