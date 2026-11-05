"use client";

import { useContext } from "react";
import { OffersSheet, type OffersSheetProps } from "@/features/offers/ui/offers-sheet";
import { OffersSheetControlContext } from "@/features/recipes/ui/offers-sheet-control";

/**
 * Story 9.3: the sheet Veckans erbjudanden for "Visa erbjudanden" in Recept's filter
 * Erbjudanden. The page (route → ui, AD-1) passes it to the library as an element;
 * the library says whether it is open (OffersSheetControlContext), so recipes never
 * import the offers module.
 */
export function RecipeOffersSheet(props: OffersSheetProps) {
  const { open, onClose } = useContext(OffersSheetControlContext);
  return <OffersSheet {...props} open={open} onClose={onClose} />;
}
