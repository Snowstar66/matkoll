"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiBadge } from "@/components/badges";
import { AiWorking } from "@/components/ai-working";
import { Button, buttonClasses } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { PlanRow } from "@/features/mealplan/ui/plan-row";
import { offerDisplay } from "@/features/offers";
import { AiSuggestionSheet } from "@/features/recipes/ui/ai-suggestion-sheet";
import { useDishSuggestions, type ShownSuggestion } from "@/features/recipes/ui/use-dish-suggestions";
import { suggestErrorMessage, suggestRetryCodes } from "@/features/suggestions";
import type { Result } from "@/lib/errors";

// "Hittar du inget? Få 2 nya idéer med erbjudandena" under På erbjudande on
// Matsedel (Story 25.3): the AI job of Story 9.5 in the mode offers, over the
// offers of all the user's stores, its dishes in the same compact rows as
// the recipes. Nothing is saved until the preview "Spara och lägg på veckan";
// the dish is then saved as a recipe first and goes on the week with no day.

/** At most this many new dishes are shown. */
export const maxIdeas = 2;

const ideaSteps = ["Letar efter idéer …", "Väger ihop förslagen …", "Sätter ihop rätterna …"];

type AddToWeek = (input: { recipeId: string; id: string; weekStart: string; weekday: null }) => Promise<Result<unknown>>;

export type OfferIdeasProps = {
  weekStart: string;
  /** mealplan.addToCurrentPlan from the page (AD-1). */
  addToWeek: AddToWeek;
  searchIngredients: SearchIngredients;
};

/** The meta line of an idea: "AI-förslag · 35 min". */
function ideaMeta({ draft }: ShownSuggestion): string {
  return ["AI-förslag", draft.totalMinutes ? `${draft.totalMinutes} min` : null].filter(Boolean).join(" · ");
}

/** The offer line of an idea: "Falukorv på erbjudande". */
function ideaDeal({ onOffer = [] }: ShownSuggestion): string | null {
  if (onOffer.length === 0) return null;
  const names = onOffer.slice(0, 3).map((label) => offerDisplay(label).title.toLowerCase());
  const text = names.length > 1 ? `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}` : names[0];
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} på erbjudande`;
}

export function OfferIdeas({ weekStart, addToWeek, searchIngredients }: OfferIdeasProps) {
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
      {ideas.length > 0 ? (
        <ul aria-label="Nya idéer" className="flex flex-col gap-2">
          {ideas.map((idea) => (
            <PlanRow key={idea.key} testId="ai-option" title={idea.draft.title} imageUrl={null} meta={ideaMeta(idea)} deal={ideaDeal(idea)}>
              <button
                type="button"
                onClick={() => setOpened(idea)}
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
          {ideas.length > 0 ? "Få 2 andra idéer med erbjudandena" : "Hittar du inget? Få 2 nya idéer med erbjudandena"}
        </button>
      )}
      <AiSuggestionSheet
        key={opened ? opened.key : "stängt"}
        suggestion={opened}
        searchIngredients={searchIngredients}
        week={{
          weekStart,
          add: addToWeek,
          onAdded: (title) => {
            showToast(`${title} sparad och på veckan.`);
            router.refresh();
          },
        }}
        onClose={() => setOpened(null)}
        onSaved={(key) => {
          setOpened(null);
          remove(key);
        }}
      />
    </div>
  );
}
