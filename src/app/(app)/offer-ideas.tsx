"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AiBadge } from "@/components/badges";
import { Button } from "@/components/button";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { PlusIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { weekdayWord } from "@/features/mealplan";
import { PlanRow } from "@/features/mealplan/ui/plan-row";
import { offerDisplay } from "@/features/offers";
import { AiSuggestionSheet } from "@/features/recipes/ui/ai-suggestion-sheet";
import type { ShownSuggestion } from "@/features/recipes/ui/use-dish-suggestions";
import { maxOfferIdeas, pollSetMs, type OfferIdea, type OfferIdeasView } from "@/features/suggestions";
import type { Result } from "@/lib/errors";

// "Nya idéer med extrapris": the AI ideas around the offers, in the card Rätter med extrapris (Veckans
// erbjudanden) and under På erbjudande on Matsedel. Pontus 2026-11-06: nobody starts them. The server
// prepares them in the background when the offers are fetched (or on the first view when there is no set
// yet) and keeps the set per household and offer week, so this only shows it: ready (an intro and up to
// three dishes with a why, in the same compact rows as the recipes), on its way ("Idéerna förbereds …",
// looked at again every few seconds) or failed ("Försök igen"). "Andra idéer" asks for another set, also
// prepared in the background. Nothing is saved until the preview "Spara och lägg på veckan"; the dish is
// then saved as a recipe first and goes on the first free day of the week.

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
  /** The saved set as the server read it; `null` when it could not be read (nothing is shown). */
  initial: OfferIdeasView | null;
  weekStart: string;
  /** mealplan.addToCurrentPlan from the page (AD-1). */
  addToWeek: AddToWeek;
  searchIngredients: SearchIngredients;
  /** suggestions.startOfferIdeas from the page: prepares a set in the background ("replace": another one). */
  start: (input?: { replace?: boolean }) => Promise<Result<OfferIdeasView>>;
  /** suggestions.readOfferIdeas from the page: the set as it is now. */
  read: () => Promise<Result<OfferIdeasView>>;
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

/** An idea of the saved set as the preview takes it: a key for the list and the id it is saved under. */
function shown(ideas: readonly OfferIdea[]): ShownSuggestion[] {
  return ideas.map((idea, key) => ({ ...idea, key })) as ShownSuggestion[];
}

const failedView = (view: OfferIdeasView): OfferIdeasView => ({ ...view, state: "failed", ideas: [], intro: "", errorCode: null });

export function OfferIdeas({ initial, weekStart, addToWeek, searchIngredients, start, read, previewOutside = false }: OfferIdeasProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [opened, setOpened] = useState<ShownSuggestion | null>(null);
  // What the server read, until a newer read (the page refreshed) replaces it; the looks in between are held here.
  const [held, setHeld] = useState({ base: initial, view: initial });
  if (held.base !== initial) setHeld({ base: initial, view: initial });
  const view = held.view;
  const setView = (next: OfferIdeasView) => setHeld((current) => ({ ...current, view: next }));
  // Ideas saved from here leave at once; the server drops them from the set on the next read.
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const asked = useRef(false);

  /** Asks the server to prepare a set; it answers at once, the set arrives by the looks below. */
  async function prepare(replace: boolean) {
    if (!view) return;
    setView({ ...view, state: "pending", ideas: [], intro: "", errorCode: null });
    let answer: Awaited<ReturnType<typeof start>>;
    try {
      answer = await start(replace ? { replace: true } : {});
    } catch {
      answer = { ok: false, error: { code: "ai_unavailable", message: "" } };
    }
    setHeld((current) => (current.view ? { ...current, view: answer.ok ? answer.data : failedView(current.view) } : current));
  }

  // No set yet and there are offers (fetched before the ideas were prepared in the background): it is prepared now, once.
  const needsStart = view?.hasOffers === true && view.state === "none";
  useEffect(() => {
    if (!needsStart || asked.current) return;
    asked.current = true;
    void prepare(false);
    // prepare reads the view only to show it pending, and runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsStart]);

  // While the ideas are prepared they are looked at again every few seconds; they show when ready.
  const pending = view?.state === "pending";
  useEffect(() => {
    if (!pending) return;
    let stopped = false;
    const timer = setInterval(() => {
      void read()
        .then((answer) => {
          if (stopped || !answer.ok || answer.data.state === "pending") return;
          setHeld((current) => ({ ...current, view: answer.data }));
        })
        .catch(() => undefined);
    }, pollSetMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, read]);

  if (!view || !view.hasOffers) return null;
  const ideas = shown(view.ideas)
    .filter((idea) => !saved.has(idea.recipeId))
    .slice(0, maxOfferIdeas);

  return (
    <div data-testid="offer-ideas" className="flex flex-col gap-2">
      <h4 className="text-body font-semibold text-ink">Nya idéer</h4>
      <div role="status">
        {view.state === "pending" || view.state === "none" ? <p className="text-meta text-ink-2">Idéerna förbereds …</p> : null}
      </div>
      {view.state === "failed" ? (
        <p role="alert" className="flex flex-wrap items-center gap-x-2 text-body text-ink">
          Det gick inte att ta fram idéer just nu.
          <Button variant="text" onClick={() => void prepare(false)}>
            Försök igen
          </Button>
        </p>
      ) : null}
      {view.state === "ready" && ideas.length > 0 && view.intro ? (
        <p data-testid="offer-ideas-intro" className="text-body text-ink">
          {view.intro}
        </p>
      ) : null}
      {view.state === "ready" && ideas.length > 0 ? (
        <ul aria-label="Nya idéer" className="flex flex-col gap-2">
          {ideas.map((idea) => (
            <PlanRow key={idea.recipeId} testId="ai-option" title={idea.draft.title} imageUrl={null} meta={ideaMeta(idea)} note={idea.why || null} deal={ideaDeal(idea)}>
              <button
                type="button"
                onClick={() =>
                  previewOutside
                    ? setOutsidePreview({
                        suggestion: idea,
                        weekStart,
                        addToWeek,
                        searchIngredients,
                        onSaved: () => setSaved((current) => new Set(current).add(idea.recipeId)),
                      })
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
      {view.state === "ready" && ideas.length > 0 ? (
        <p className="flex items-center gap-2 text-meta text-ink-2">
          <AiBadge />
          Granska och spara innan något hamnar på veckan.
        </p>
      ) : null}
      {view.state === "ready" ? (
        <button
          type="button"
          data-testid="offer-ideas-other"
          onClick={() => void prepare(true)}
          className="flex min-h-tap items-center self-start text-control font-semibold text-accent underline underline-offset-2"
        >
          Andra idéer
        </button>
      ) : null}
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
          onSaved={() => {
            if (opened) setSaved((current) => new Set(current).add(opened.recipeId));
            setOpened(null);
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
