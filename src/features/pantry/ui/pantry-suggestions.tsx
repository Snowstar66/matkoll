"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type PantryAnalysis, usePantryAnalysis } from "./use-pantry-analysis";

// Lagerförslag for Hemma (FR-24): one analysis state for the page, shared by
// the camera button (PantryCamera) and the section (PantrySuggestionList).
// The provider sits above the <Suspense> keyed on the location and has no key
// of its own, so the suggestions stay when another location card is chosen,
// and go when Hemma is left or reloaded.

const PantrySuggestionsContext = createContext<PantryAnalysis | null>(null);

/** Holds the camera's analysis and its suggestions for Hemma. Put it above PantrySheetProvider. */
export function PantrySuggestionsProvider({ children }: { children: ReactNode }) {
  const analysis = usePantryAnalysis();
  return <PantrySuggestionsContext.Provider value={analysis}>{children}</PantrySuggestionsContext.Provider>;
}

/** The analysis and its suggestions; needs a PantrySuggestionsProvider above. */
export function usePantrySuggestions(): PantryAnalysis {
  const analysis = useContext(PantrySuggestionsContext);
  if (!analysis) throw new Error("usePantrySuggestions needs a PantrySuggestionsProvider");
  return analysis;
}
