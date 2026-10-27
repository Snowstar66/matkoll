"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AiBadge } from "@/components/badges";
import { Button, buttonClasses } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { nameInSentence, normalizeIngredientText } from "@/features/catalog";
import { suggestErrorMessage, suggestRetryCodes } from "@/features/suggestions";
import { recipeMetaText } from "../domain/recipe-list";
import { AiSuggestionSheet } from "./ai-suggestion-sheet";
import { RecipeCard } from "./recipe-card";
import type { DishSuggestionsState, ShownSuggestion } from "./use-dish-suggestions";

// AI-förslag at the bottom of the filter Kan lagas nu (FR-23, EXPERIENCE.md,
// Flöde 5): "Föreslå rätter med AI" asks /api/ai/suggest, with "Letar efter
// idéer …" and "Avbryt" in the button's place while it runs. The suggestions
// come in a section of their own under the library, each marked "AI-förslag",
// never mixed with the recipes and without a status until saved. "Spara" opens
// the preview (AiSuggestionSheet). Errors show in a notice here, so the
// library keeps working. The state comes from the library (useDishSuggestions).

/** At most this many ingredient names on a card, after "Med: ". */
const maxCardNames = 5;

export type AiSuggestionsProps = {
  /** The suggestions and the calls (useDishSuggestions); without it nothing is shown. */
  dishes?: DishSuggestionsState;
  searchIngredients: SearchIngredients;
  /**
   * Whether "Föreslå rätter med AI" is offered (not under a failed search,
   * whose notice is the way forward). A call on its way keeps its progress
   * and "Avbryt" either way, and the suggestions stay.
   */
  offerButton?: boolean;
};

export function AiSuggestions({ dishes, searchIngredients, offerButton = true }: AiSuggestionsProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<ShownSuggestion | null>(null);
  // What this mount has already moved focus for: a remount (a pill changed
  // back) does not take focus for suggestions that came earlier.
  const handledArrivals = useRef(dishes?.arrivals ?? 0);
  const handledCancels = useRef(dishes?.cancels ?? 0);
  const arrivals = dishes?.arrivals ?? 0;
  const cancels = dishes?.cancels ?? 0;

  // New suggestions: focus on the section's heading, so they are read out from the start.
  useEffect(() => {
    if (arrivals === handledArrivals.current) return;
    handledArrivals.current = arrivals;
    headingRef.current?.focus();
  }, [arrivals]);
  // "Avbryt": the button is back, with focus.
  useEffect(() => {
    if (cancels === handledCancels.current) return;
    handledCancels.current = cancels;
    buttonRef.current?.focus();
  }, [cancels]);

  if (!dishes) return null;
  const { suggestions, loading, error, suggest, cancel, remove } = dishes;

  let notice = null;
  if (error && !loading) {
    const action =
      error.code === "suggest_empty_pantry" ? (
        <Link href="/hemma" className={buttonClasses("text")}>
          Öppna Lagersaldo
        </Link>
      ) : suggestRetryCodes.has(error.code) ? (
        <Button variant="text" onClick={suggest}>
          Försök igen
        </Button>
      ) : undefined;
    notice = (
      <Notice role="alert" action={action}>
        {suggestErrorMessage(error)}
      </Notice>
    );
  }

  return (
    <div data-testid="ai-suggestions" className="flex flex-col gap-3">
      {notice}
      {suggestions.length > 0 ? (
        <section aria-labelledby={headingId} className="flex flex-col gap-3">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-section-label text-ink-2">
            AI-förslag
          </h2>
          <ul className="grid gap-3 desktop:grid-cols-2">
            {suggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.key} suggestion={suggestion} onSave={() => setOpened(suggestion)} />
            ))}
          </ul>
        </section>
      ) : null}
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status">{loading ? <Thinking /> : null}</div>
      {loading ? (
        <Button variant="text" onClick={cancel} className="-ml-3 self-start">
          Avbryt
        </Button>
      ) : offerButton ? (
        <Button ref={buttonRef} type="button" variant="secondary" fullWidth onClick={suggest}>
          {suggestions.length > 0 ? "Föreslå andra rätter" : "Föreslå rätter med AI"}
        </Button>
      ) : null}
      <AiSuggestionSheet
        key={opened?.key ?? "stängt"}
        suggestion={opened}
        onClose={() => setOpened(null)}
        onSaved={(key) => {
          setOpened(null);
          remove(key);
        }}
        searchIngredients={searchIngredients}
      />
    </div>
  );
}

/**
 * The names a card shows: the catalog's name for a linked line, otherwise the
 * AI's, each once (compared normalised, so "Grädde" and "grädde" are one).
 * They run on after "Med: ", so a catalog name, which starts with a capital
 * (Story 10.4), starts in lower case; the AI's own text is shown as written.
 */
function cardNames({ draft, ingredientNames }: ShownSuggestion): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of draft.lines) {
    const { ingredient } = line;
    const linked = ingredient.kind === "match" || ingredient.kind === "chosen" ? ingredientNames[ingredient.ingredientId] : undefined;
    const name = linked !== undefined ? nameInSentence(linked.trim()) : (line.hint?.name ?? line.originalText).trim();
    const key = normalizeIngredientText(name) || name;
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names.slice(0, maxCardNames);
}

/**
 * Kort för ett AI-förslag, a recipe card (Epic 11): a short mint strip with
 * the AI label on it in place of a status and no heart, the title, "35 min ·
 * 4 portioner", "Med: " and at most five ingredient names, and "Spara"; the
 * label is read before "Spara". The card is no link: a suggestion has no
 * recipe view until it is saved. Never an image: an address from the model
 * is not loaded (AD-15 loads only recipe sites' own images).
 */
function SuggestionCard({ suggestion, onSave }: { suggestion: ShownSuggestion; onSave: () => void }) {
  const { draft } = suggestion;
  return (
    <RecipeCard
      data-testid="ai-suggestion"
      title={draft.title}
      imageUrl={null}
      meta={recipeMetaText(draft.totalMinutes, draft.servings)}
      badge={<AiBadge />}
    >
      <p className="text-body break-words text-ink-2">Med: {cardNames(suggestion).join(", ")}</p>
      <Button variant="secondary" onClick={onSave} aria-label={`Spara ${draft.title}`}>
        Spara
      </Button>
    </RecipeCard>
  );
}

/** "Letar efter idéer …" with a progress bar (EXPERIENCE.md, AI-förslag hämtas). */
function Thinking() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">Letar efter idéer …</p>
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
      </div>
    </div>
  );
}
