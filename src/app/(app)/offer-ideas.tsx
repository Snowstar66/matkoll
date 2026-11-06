"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { AiBadge } from "@/components/badges";
import { AiWorking } from "@/components/ai-working";
import { Button, buttonClasses } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { weekdayWord } from "@/features/mealplan";
import { PlanRow } from "@/features/mealplan/ui/plan-row";
import { offerDisplay } from "@/features/offers";
import { AiSuggestionSheet } from "@/features/recipes/ui/ai-suggestion-sheet";
import { useDishSuggestions, type ShownSuggestion } from "@/features/recipes/ui/use-dish-suggestions";
import { suggestErrorMessage, suggestRetryCodes } from "@/features/suggestions";
import type { Result } from "@/lib/errors";

// "Nya idéer med extrapris": the one flow for AI ideas around the offers, in
// the card Rätter med extrapris (Veckans erbjudanden) and under På erbjudande
// on Matsedel (Story 25.3). The AI job of Story 9.5 in the mode offers, over
// the offers of all the user's stores, answers like a friend (an intro and a
// why per dish, checked by the server) in the same compact rows as the recipes.
// Nothing is saved until the preview "Spara och lägg på veckan"; the dish is
// then saved as a recipe first and goes on the first free day of the week.

/** At most this many new dishes are shown. */
export const maxIdeas = 3;

const ideaSteps = ["Letar efter idéer …", "Väger ihop förslagen …", "Sätter ihop rätterna …"];

type AddToWeek = (input: { recipeId: string; id: string; weekStart: string }) => Promise<Result<{ weekday?: number | null }>>;

/**
 * The preview of an idea opened from inside another sheet (Rätter med extrapris in Veckans
 * erbjudanden). Only one sheet shows at a time, so opening the preview closes the offers sheet and
 * unmounts the card; the preview therefore lives here, outside it, and OfferIdeaPreviewHost (in the
 * app layout) shows it.
 */
type OutsidePreview = {
  suggestion: ShownSuggestion;
  weekStart: string;
  addToWeek: AddToWeek;
  searchIngredients: SearchIngredients;
  onSaved: (key: number) => void;
};

let outsidePreview: OutsidePreview | null = null;
const previewListeners = new Set<() => void>();

function setOutsidePreview(preview: OutsidePreview | null) {
  outsidePreview = preview;
  for (const listener of previewListeners) listener();
}

function subscribePreview(listener: () => void) {
  previewListeners.add(listener);
  return () => {
    previewListeners.delete(listener);
  };
}

export type OfferIdeasProps = {
  weekStart: string;
  /** mealplan.addToCurrentPlan from the page (AD-1). */
  addToWeek: AddToWeek;
  searchIngredients: SearchIngredients;
  /** Inside another sheet: the preview opens through OfferIdeaPreviewHost, which outlives that sheet. */
  previewOutside?: boolean;
};

/** The meta line of an idea: "AI-förslag · 35 min". */
function ideaMeta({ draft }: ShownSuggestion): string {
  return ["AI-förslag", draft.totalMinutes ? `${draft.totalMinutes} min` : null].filter(Boolean).join(" · ");
}

/** The offer line of an idea: "Falukorv på extrapris". */
function ideaDeal({ onOffer = [] }: ShownSuggestion): string | null {
  if (onOffer.length === 0) return null;
  const names = onOffer.slice(0, 3).map((label) => offerDisplay(label).title.toLowerCase());
  const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}` : names[0];
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} på extrapris`;
}

export function OfferIdeas({ weekStart, addToWeek, searchIngredients, previewOutside = false }: OfferIdeasProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const dishes = useDishSuggestions(null, { mode: "offers", visible: true });
  const [opened, setOpened] = useState<ShownSuggestion | null>(null);
  const { suggestions, arrivals, loading, waiting, error, suggest, cancel, remove } = dishes;
  // The first two of each answer are the ideas; saving one never brings a third into view.
  const [batch, setBatch] = useState<{ arrivals: number; keys: readonly number[] }>({ arrivals: 0, keys: [] });
  if (batch.arrivals !== arrivals) setBatch({ arrivals, keys: suggestions.slice(0, maxIdeas).map((idea) => idea.key) });
  const ideas = suggestions.filter((idea) => batch.keys.includes(idea.key));

  return (
    <div data-testid="offer-ideas" className="flex flex-col gap-2">
      {error && !loading ? (
        <Notice
          role="alert"
          action={
            error.code === "suggest_empty_pantry" ? (
              <Link href="/hemma" className={buttonClasses("text")}>
                Öppna Matvaror
              </Link>
            ) : suggestRetryCodes.has(error.code) ? (
              <Button variant="text" onClick={suggest}>
                Försök igen
              </Button>
            ) : undefined
          }
        >
          {suggestErrorMessage(error)}
        </Notice>
      ) : null}
      {ideas.length > 0 && dishes.intro ? (
        <p data-testid="offer-ideas-intro" className="text-body text-ink">
          {dishes.intro}
        </p>
      ) : null}
      {ideas.length > 0 ? (
        <ul aria-label="Nya idéer" className="flex flex-col gap-2">
          {ideas.map((idea) => (
            <PlanRow key={idea.key} testId="ai-option" title={idea.draft.title} imageUrl={null} meta={ideaMeta(idea)} note={idea.why || null} deal={ideaDeal(idea)}>
              <button
                type="button"
                onClick={() =>
                  previewOutside
                    ? setOutsidePreview({ suggestion: idea, weekStart, addToWeek, searchIngredients, onSaved: remove })
                    : setOpened(idea)
                }
                aria-label={`Granska och spara: ${idea.draft.title}`}
                className="flex size-tap shrink-0 items-center justify-center rounded-full bg-mint text-mint-ink"
              >
                <PlusIcon size={20} />
              </button>
            </PlanRow>
          ))}
        </ul>
      ) : null}
      {ideas.length > 0 ? (
        <p className="flex items-center gap-2 text-meta text-ink-2">
          <AiBadge />
          Granska och spara innan något hamnar på veckan.
        </p>
      ) : null}
      <div role="status">
        {loading ? (
          <div className="flex flex-col gap-2">
            {waiting ? <p className="text-body text-ink">{waiting}</p> : <AiWorking inLiveRegion steps={ideaSteps} />}
            <p className="text-meta text-ink-2">Du kan göra annat under tiden.</p>
          </div>
        ) : null}
      </div>
      {loading ? (
        <Button variant="text" onClick={cancel} className="-ml-3 self-start">
          Avbryt
        </Button>
      ) : (
        <button
          type="button"
          data-testid="offer-ideas-start"
          onClick={suggest}
          className="min-h-tap rounded-md border border-dashed border-border bg-bg px-3 py-3 text-control font-semibold text-accent"
        >
          {ideas.length > 0 ? "Andra idéer med extrapris" : "Nya idéer med extrapris"}
        </button>
      )}
      {previewOutside ? null : (
        <AiSuggestionSheet
          key={opened ? opened.key : "stängt"}
          suggestion={opened}
          searchIngredients={searchIngredients}
          week={{
            weekStart,
            add: addToWeek,
            onAdded: (title, weekday) => {
              showToast(addedIdeaText(title, weekday));
              router.refresh();
            },
          }}
          onClose={() => setOpened(null)}
          onSaved={(key) => {
            setOpened(null);
            remove(key);
          }}
        />
      )}
    </div>
  );
}

function addedIdeaText(title: string, weekday: number | null | undefined): string {
  return weekday ? `${title} sparad, på ${weekdayWord(weekday)}.` : `${title} sparad och på veckan. Alla dagar har en rätt.`;
}

/** Shows the preview OfferIdeas opened from inside another sheet; rendered once, in the app layout. */
export function OfferIdeaPreviewHost() {
  const router = useRouter();
  const { showToast } = useToast();
  const preview = useSyncExternalStore(subscribePreview, () => outsidePreview, () => null);
  // Nothing is rendered until an idea is opened: the layout is prerendered, and the sheet makes ids when it renders.
  if (!preview) return null;
  return (
    <AiSuggestionSheet
      key={preview.suggestion.key}
      suggestion={preview.suggestion}
      searchIngredients={preview.searchIngredients}
      week={{
        weekStart: preview.weekStart,
        add: preview.addToWeek,
        onAdded: (title, weekday) => {
          showToast(addedIdeaText(title, weekday));
          router.refresh();
        },
      }}
      onClose={() => setOutsidePreview(null)}
      onSaved={(key) => {
        preview.onSaved(key);
        setOutsidePreview(null);
      }}
    />
  );
}
