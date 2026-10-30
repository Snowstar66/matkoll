"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { AiBadge } from "@/components/badges";
import { Button, buttonClasses } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { focusAfterRemoval } from "@/components/trash-button";
import { planningButtonText, type PlanningTarget } from "@/features/mealplan";
import { nameInSentence, normalizeIngredientText } from "@/features/catalog";
import { suggestErrorMessage, suggestRetryCodes, whyText } from "@/features/suggestions";
import { offerDisplay } from "@/features/offers";
import type { AddToPlan } from "./add-to-plan-button";
import { OwnRecipes, type OwnRecipesRead } from "./own-recipes";
import { dishEmoji } from "../domain/dish-emoji";
import { recipeMetaText } from "../domain/recipe-list";
import { AiSuggestionSheet } from "./ai-suggestion-sheet";
import { RecipeCard } from "./recipe-card";
import type { DishSuggestionsState, ShownSuggestion } from "./use-dish-suggestions";

// AI-förslag at the bottom of the filter Kan lagas nu (FR-23, EXPERIENCE.md,
// Flöde 5): "Föreslå rätter med AI" starts an AI job (Story 12.4), with "Letar
// efter idéer … Du kan göra annat under tiden." and "Avbryt", or "I kö, 1
// före.", in the button's place while it waits or runs. The suggestions
// come in a section of their own under the library, each marked "AI-förslag",
// never mixed with the recipes and without a status until saved. "Spara" opens
// the preview (AiSuggestionSheet). Errors show in a notice here, so the
// library keeps working. The state comes from the library (useDishSuggestions).

/** At most this many ingredient names on a card, after "Med: ". */
const maxCardNames = 4;

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
  /** mealplan.addToCurrentPlan from the page (AD-1): suggestions built around offers can go straight to the menu (Story 9.5). */
  addToPlan?: AddToPlan;
  /** suggestions.ownRecipesWithOffers from the page (AD-1): "Från dina recept" while an offers job is on or its dishes are shown (Story 16.3). */
  ownRecipes?: OwnRecipesRead;
  /** Planning mode (Story 13.8): "Lägg på matsedeln" puts the dish on this day. */
  planning?: PlanningTarget;
};

export function AiSuggestions({ dishes, searchIngredients, offerButton = true, addToPlan, ownRecipes, planning }: AiSuggestionsProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState<{ suggestion: ShownSuggestion; toMenu: boolean } | null>(null);
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
  const { suggestions, mode, storeName, loading, waiting, error, stale, suggest, cancel, remove } = dishes;
  const byOffers = mode === "offers";

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
      {/* Suggestions of another place than the library shows (AD-24): they can still be saved. */}
      {stale && suggestions.length > 0 ? (
        <Notice
          action={
            <Button variant="text" onClick={suggest} disabled={loading}>
              Föreslå igen
            </Button>
          }
        >
          {stale.siteName ? `Förslagen bygger på lagret för ${stale.siteName}.` : "Förslagen bygger på lagret för ett annat ställe."}
        </Notice>
      ) : null}
      {/* Story 16.3: Pontus's own recipes first, from the offers, with no wait for the AI. */}
      {ownRecipes && dishes.offersJob ? <OwnRecipes read={ownRecipes} storeId={dishes.offersJob.storeId} addToPlan={addToPlan} planning={planning} /> : null}
      {suggestions.length > 0 ? (
        <section aria-labelledby={headingId} className="flex flex-col gap-3">
          <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-section-label text-ink-2">
            {byOffers ? (storeName ? `Med veckans erbjudanden från ${storeName}` : "AI-förslag från veckans erbjudanden") : "AI-förslag"}
          </h2>
          <ul className="grid gap-3 desktop:grid-cols-2">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.key}
                suggestion={suggestion}
                onRemove={(bin) => {
                  focusAfterRemoval(bin);
                  remove(suggestion.key);
                }}
                onSave={() => setOpened({ suggestion, toMenu: false })}
                onAddToPlan={byOffers && addToPlan ? () => setOpened({ suggestion, toMenu: true }) : undefined}
                planning={planning}
              />
            ))}
          </ul>
        </section>
      ) : null}
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status">{loading ? <Thinking waiting={waiting} /> : null}</div>
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
        key={opened ? `${opened.suggestion.key}-${opened.toMenu}` : "stängt"}
        suggestion={opened?.suggestion ?? null}
        addToPlan={addToPlan}
        toMenu={opened?.toMenu ?? false}
        planningDay={planning}
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
 * 4 portioner", "Med: " and at most four ingredient names, and "Spara"; the
 * label is read before "Spara". The card is no link: a suggestion has no
 * recipe view until it is saved. Never an image: an address from the model
 * is not loaded (AD-15 loads only recipe sites' own images).
 */
function SuggestionCard({
  suggestion,
  onSave,
  onAddToPlan,
  onRemove,
  planning,
}: {
  suggestion: ShownSuggestion;
  onRemove: (bin: HTMLButtonElement) => void;
  onSave: () => void;
  onAddToPlan?: () => void;
  planning?: PlanningTarget;
}) {
  const { draft, onOffer = [], atHome, toBuy = [] } = suggestion;
  const offerNames = onOffer.map((label) => offerDisplay(label).title);
  return (
    <RecipeCard
      data-testid="ai-suggestion"
      title={draft.title}
      imageUrl={null}
      emoji={dishEmoji(draft.title)}
      meta={recipeMetaText(draft.totalMinutes, draft.servings)}
      badge={<AiBadge />}
      onDelete={onRemove}
      deleteLabel={`Ta bort förslaget ${draft.title}`}
    >
      <p className="text-meta break-words text-ink-2">Med: {cardNames(suggestion).join(", ")}</p>
      {atHome ? (
        <>
          <p data-testid="ai-suggestion-why" className="text-meta break-words text-ink">
            {whyText({ onOffer: onOffer.length, have: atHome.have, toBuy })}
          </p>
          {offerNames.length > 0 ? (
            <p data-testid="ai-suggestion-offers" className="text-meta break-words text-ink-2">
              Erbjudanden: {offerNames.join(", ")}
            </p>
          ) : null}
        </>
      ) : null}
      {onAddToPlan ? (
        <Button onClick={onAddToPlan} aria-label={`${planning ? planningButtonText(planning) : "Lägg på matsedeln"}: ${draft.title}`}>
          {planning ? planningButtonText(planning) : "Lägg på matsedeln"}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onSave} aria-label={`Spara ${draft.title}`}>
        Spara
      </Button>
    </RecipeCard>
  );
}

/**
 * "Letar efter idéer … Du kan göra annat under tiden." with a progress bar
 * (EXPERIENCE.md, AI-förslag hämtas), or "I kö, 1 före." while the job waits
 * behind others (Story 12.4).
 */
function Thinking({ waiting }: { waiting: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">{waiting ?? "Letar efter idéer …"}</p>
      <p className="text-meta text-ink-2">Du kan göra annat under tiden.</p>
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
      </div>
    </div>
  );
}
