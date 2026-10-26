"use client";

import { Button } from "@/components/button";

// AI-förslag at the bottom of the filter Kan lagas nu (FR-23, EXPERIENCE.md,
// Flöde 5). Story 5.1 places the component; Story 5.2 fills it (the call to
// /api/ai/suggest, the progress, the errors and the section with the
// suggestions) and passes `onSuggest`. Without it nothing is shown, so the
// library never has a button that does nothing.

export type AiSuggestionsProps = {
  /** Asks the AI for dishes; until Story 5.2 passes it, the button is not shown. */
  onSuggest?: () => void;
};

/**
 * "Föreslå rätter med AI", a secondary button across the full width: the
 * library has no primary button, and DESIGN.md allows at most one.
 */
export function AiSuggestions({ onSuggest }: AiSuggestionsProps) {
  if (!onSuggest) return null;
  return (
    <div data-testid="ai-suggestions">
      <Button type="button" variant="secondary" fullWidth onClick={onSuggest}>
        Föreslå rätter med AI
      </Button>
    </div>
  );
}
