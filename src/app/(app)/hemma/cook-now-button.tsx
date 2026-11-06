"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { ChevronRightIcon, InfoIcon, SparkleIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { eatFirstTipText } from "@/features/pantry";
import { recipeMetaText, recipeTimeText, stepText, type RecipeDraft } from "@/features/recipes";
import {
  dishSuggestionsSchema,
  suggestErrorMessage,
  toAvoidTitles,
  type CookNowOneMissing,
  type CookNowRecipe,
  type DishSuggestion,
} from "@/features/suggestions";
import { isActive } from "@/lib/ai-job-shape";
import { useAiJobs, useShowingAiResults } from "@/lib/ai-jobs-client";
import { fail, isErrorCode, type AppError, type Result } from "@/lib/errors";

// "Vad kan jag laga nu?" (Story 25.2): the card at the top of Matvaror and the
// sheet "Kan lagas nu" it opens in place. The library's recipes come at once
// (readCookNow, no AI); the AI's dishes come as a job (mode `now`) and show
// under "Nya idéer" with a calm loading row. Everything is temporary: no
// dish has a bin, the result of the job is kept here in the browser for 30
// minutes (so the sheet can be opened again at once), and the job itself is
// cancelled or dismissed when the sheet closes, so nothing piles up in the AI
// jobs. Nothing is saved without "Spara som recept".

/** How long a result is shown again when the sheet is opened anew; then a fresh run. */
export const cookNowReuseMs = 30 * 60 * 1000;

/** The data the sheet reads (suggestions.readCookNow), given by the page (AD-1). */
export type CookNowData = {
  own: CookNowRecipe[];
  oneMissing: CookNowOneMissing[];
  tip: { name: string; days: number } | null;
  siteId: string | null;
};

export type CookNowButtonProps = {
  /** suggestions.readCookNow. */
  readCookNow: () => Promise<Result<CookNowData>>;
  /** recipes.saveRecipe: "Spara som recept" is the only thing that writes. */
  saveRecipe: (draft: RecipeDraft, recipeId: string) => Promise<Result<{ id: string }>>;
};

/** A dish of the AI as the sheet holds it: with the id it gets when saved, made when it arrives. */
type Idea = DishSuggestion & { key: number; recipeId: string };

/** The last result, kept for 30 minutes (per tab, never in storage). */
let kept: { siteId: string | null; at: number; ideas: DishSuggestion[] } | null = null;

/** Forgets the kept result, for tests. */
export function resetCookNowKept(): void {
  kept = null;
}

export function CookNowButton(props: CookNowButtonProps) {
  const [open, setOpen] = useState(false);
  // A new key for each opening: the sheet starts afresh, with its own run.
  const [opening, setOpening] = useState(0);
  return (
    <>
      <button
        type="button"
        data-testid="find-dishes"
        onClick={() => {
          setOpening((count) => count + 1);
          setOpen(true);
        }}
        className="flex w-full items-center gap-3 rounded-lg bg-accent p-4 text-left text-on-accent"
      >
        <SparkleIcon size={26} className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-headline">Vad kan jag laga nu?</span>
          <span className="text-meta opacity-90">Med det du har i kyl, frys och skafferi</span>
        </span>
        <ChevronRightIcon size={18} className="shrink-0" />
      </button>
      {opening > 0 ? <CookNowSheet key={opening} open={open} onClose={() => setOpen(false)} {...props} /> : null}
    </>
  );
}

function CookNowSheet({ open, onClose, readCookNow, saveRecipe }: CookNowButtonProps & { open: boolean; onClose: () => void }) {
  const { jobs, start, fetchResult, cancel, dismiss } = useAiJobs();
  const { showToast } = useToast();
  const [data, setData] = useState<CookNowData | null>(null);
  const [readError, setReadError] = useState<AppError | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [jobError, setJobError] = useState<AppError | null>(null);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saved, setSaved] = useState<ReadonlySet<number>>(new Set());
  const nextKey = useRef(0);
  const handled = useRef(new Set<string>());
  /** The titles shown in this opening, so "Andra förslag" never repeats them. */
  const shownTitles = useRef<string[]>([]);
  const startKey = useRef<string | null>(null);
  const siteRef = useRef<string | null>(null);
  /** The job of this sheet, for the clean-up when it closes. */
  const live = useRef<{ id: string | null; active: boolean }>({ id: null, active: false });

  const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : undefined;
  const loading = starting || (job !== undefined && isActive(job));
  const jobActive = job !== undefined && isActive(job);
  useEffect(() => {
    live.current = { id: jobId, active: jobActive };
  });

  // The result is on the screen: no confirmation says it is done.
  useShowingAiResults("suggest", open);

  /** Starts a run of the model, avoiding `avoid`. */
  async function run(avoid: readonly string[]) {
    setStarting(true);
    setJobError(null);
    const clientKey = (startKey.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", mode: "now", avoidTitles: toAvoidTitles(avoid) }, clientKey);
    setStarting(false);
    if (!result.ok) {
      // A network error may be tried again with the same key; any other answer is final for this tap.
      if (result.error.code !== "ai_unavailable") startKey.current = null;
      setJobError(result.error);
      return;
    }
    startKey.current = null;
    setJobId(result.data.job.id);
  }

  // Opening: the library at once, then the kept result or a new run.
  useEffect(() => {
    if (!open) return;
    let stopped = false;
    void (async () => {
      const read = await readCookNow();
      if (stopped) return;
      if (!read.ok) {
        setReadError(read.error);
        return;
      }
      setData(read.data);
      siteRef.current = read.data.siteId;
      if (kept && kept.siteId === read.data.siteId && Date.now() - kept.at < cookNowReuseMs) {
        take(kept.ideas);
        return;
      }
      await run([]);
    })();
    return () => {
      stopped = true;
    };
    // Once per opening; the functions are made anew at each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Closing (or leaving the page): a run that is on its way is stopped, and the result of a finished one is closed.
  useEffect(() => {
    if (!open) return;
    return () => {
      const { id, active } = live.current;
      if (id && active) void cancel(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** The dishes of a result are shown, and the title of each is avoided by "Andra förslag". */
  function take(suggestions: readonly DishSuggestion[]) {
    setIdeas(suggestions.map((suggestion) => ({ ...suggestion, key: ++nextKey.current, recipeId: crypto.randomUUID() })));
    shownTitles.current = suggestions.map(({ draft }) => draft.title);
    setExpanded(null);
  }

  // The job is done: its dishes are fetched once, kept for 30 minutes, and the job is closed at once.
  const finishedId = job && (job.status === "done" || job.status === "failed" || job.status === "cancelled" || job.status === "superseded") ? job.id : null;
  const finishedStatus = job?.status;
  const finishedCode = job?.errorCode ?? null;
  useEffect(() => {
    if (!finishedId || handled.current.has(finishedId)) return;
    handled.current.add(finishedId);
    if (finishedStatus !== "done") {
      const code = finishedCode !== null && isErrorCode(finishedCode) ? finishedCode : "ai_unavailable";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- shows why a job that finished elsewhere did not go.
      setJobError(fail(code).error);
      void dismiss(finishedId);
      return;
    }
    void (async () => {
      const result = await fetchResult(finishedId);
      void dismiss(finishedId);
      if (!result.ok) {
        setJobError(result.error);
        return;
      }
      const parsed = dishSuggestionsSchema.safeParse(result.data.result);
      if (!parsed.success) {
        setJobError(fail("ai_invalid").error);
        return;
      }
      kept = { siteId: siteRef.current, at: Date.now(), ideas: parsed.data.suggestions };
      take(parsed.data.suggestions);
    })();
    // The functions of useAiJobs change with the list; the job's id is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedId, finishedStatus, finishedCode]);

  function again() {
    if (loading) return;
    kept = null;
    setIdeas([]);
    void run(shownTitles.current);
  }

  async function save(idea: Idea) {
    const result = await saveRecipe(idea.draft, idea.recipeId);
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      return;
    }
    setSaved((current) => new Set(current).add(idea.key));
    showToast(`${idea.draft.title} finns nu i Recept.`);
  }

  const toggle = (id: string) => setExpanded((current) => (current === id ? null : id));
  const perfect = ideas.filter((idea) => (idea.toBuy ?? []).length === 0).slice(0, 3);
  const oneMissingIdeas = ideas.filter((idea) => (idea.toBuy ?? []).length === 1);
  const oneMissingCount = (data?.oneMissing.length ?? 0) + oneMissingIdeas.length;
  const own = data?.own ?? [];
  const nothing = data !== null && !loading && own.length === 0 && perfect.length === 0 && oneMissingCount === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Kan lagas nu" subtitle="Allt finns hemma. Basvaror räknas som hemma." closeLabel="Klar">
      <div data-testid="cook-now-sheet" className="flex flex-col gap-4">
        {readError ? (
          <p role="alert" className="text-body text-ink">
            {suggestErrorMessage(readError)}
          </p>
        ) : null}
        {data?.tip ? (
          <p data-testid="cook-now-tip" className="flex items-center gap-2 rounded-md bg-sand p-3 text-body text-sand-ink">
            <InfoIcon size={18} className="shrink-0" />
            <span>{eatFirstTipText(data.tip.name, data.tip.days)}</span>
          </p>
        ) : null}

        {own.length > 0 ? (
          <section aria-labelledby="cook-now-own" className="flex flex-col gap-2">
            <h3 id="cook-now-own" className="text-section-label text-ink-2">
              DINA RECEPT
            </h3>
            {own.map((recipe) => (
              <div key={recipe.id} data-testid="cook-now-own" className="rounded-lg bg-bg">
                <RowButton
                  expanded={expanded === recipe.id}
                  onClick={() => toggle(recipe.id)}
                  lead={<RecipeImage src={recipe.imageUrl} iconSize={20} className="size-11 rounded-md" />}
                  title={recipe.title}
                  meta={recipeMetaText(recipe.totalMinutes, recipe.servings)}
                />
                {expanded === recipe.id ? (
                  <div className="flex flex-col items-start gap-2 px-3 pb-3 pl-[68px]">
                    {recipe.uses.length > 0 ? <p className="text-meta text-ink-2">Använder {listNames(recipe.uses)}.</p> : null}
                    <Link href={`/recept/${recipe.id}`} className="text-row-title text-accent">
                      Öppna receptet
                    </Link>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ) : null}

        {data !== null && (loading || perfect.length > 0 || jobError) ? (
          <section aria-labelledby="cook-now-ideas" className="flex flex-col gap-2">
            <h3 id="cook-now-ideas" className="text-section-label text-ink-2">
              NYA IDÉER
            </h3>
            {perfect.map((idea) => (
              <div key={idea.key} data-testid="cook-now-idea" className="rounded-lg bg-bg">
                <RowButton
                  expanded={expanded === `idea-${idea.key}`}
                  onClick={() => toggle(`idea-${idea.key}`)}
                  title={idea.draft.title}
                  meta={[recipeTimeText(idea.draft.totalMinutes), "Ny idé"].filter(Boolean).join(" · ")}
                />
                {expanded === `idea-${idea.key}` ? (
                  <div className="flex flex-col gap-3 px-3 pb-3">
                    <ul className="flex flex-col gap-1.5">
                      {idea.draft.lines.map((line, index) => (
                        <li key={index} className="flex gap-2 text-body">
                          <span aria-hidden="true" className="text-accent">
                            ✓
                          </span>
                          <span>{line.originalText}</span>
                        </li>
                      ))}
                    </ul>
                    <ol className="flex list-decimal flex-col gap-1 pl-5 text-body">
                      {idea.draft.steps.map((step, index) => (
                        <li key={index}>{stepText(step)}</li>
                      ))}
                    </ol>
                    <Button
                      variant="secondary"
                      className="self-start"
                      disabled={saved.has(idea.key)}
                      onClick={() => void save(idea)}
                    >
                      {saved.has(idea.key) ? "Sparad i Recept" : "Spara som recept"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
            {/* Mounted at once, so the text is announced when it appears. */}
            <div role="status">{loading ? <LoadingRow /> : null}</div>
            {jobError && !loading ? <IdeasError error={jobError} onRetry={again} /> : null}
          </section>
        ) : null}

        {oneMissingCount > 0 ? (
          <details open data-testid="cook-now-one-missing" className="rounded-lg bg-bg p-3">
            <summary className="cursor-pointer text-row-title">Saknar bara en vara ({oneMissingCount})</summary>
            <ul className="flex flex-col gap-2 pt-2.5 text-body">
              {data?.oneMissing.map((recipe) => (
                <MissingRow key={recipe.id} title={recipe.title} missing={recipe.missing} />
              ))}
              {oneMissingIdeas.map((idea) => (
                <MissingRow key={idea.key} title={idea.draft.title} missing={idea.toBuy?.[0] ?? ""} />
              ))}
            </ul>
          </details>
        ) : null}

        {nothing ? <p className="text-body text-ink-2">Inget går att laga med bara det du har just nu.</p> : null}

        <div className="flex flex-col items-center gap-1.5 pb-2">
          <Button variant="text" disabled={loading || data === null} onClick={again}>
            Andra förslag
          </Button>
          <p className="text-center text-meta text-ink-3">Förslagen försvinner av sig själva. Spara den du vill ha kvar.</p>
        </div>
      </div>
    </Sheet>
  );
}

/** "ägg", "ägg och mjölk", "ägg, mjölk och smör". */
function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

function MissingRow({ title, missing }: { title: string; missing: string }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 break-words">{title}</span>
      <span className="shrink-0 font-semibold text-sand-ink">Saknar {missing}</span>
    </li>
  );
}

function LoadingRow() {
  return (
    <div data-testid="cook-now-loading" className="flex flex-col gap-1 rounded-lg bg-bg p-3">
      <AiWorking inLiveRegion size="sm" steps={["Letar efter idéer …", "Väger ihop förslagen …", "Sätter ihop rätterna …"]} />
    </div>
  );
}

function IdeasError({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  // Nothing that passed the check is no failure: the library's recipes above are the answer.
  const text = error.code === "ai_invalid" ? "Inga nya idéer just nu. Prova Andra förslag." : suggestErrorMessage(error);
  return (
    <div className="flex flex-col items-start gap-1 rounded-lg bg-bg p-3">
      <p role="status" className="text-body text-ink-2">
        {text}
      </p>
      <Button variant="compact" onClick={onRetry}>
        Försök igen
      </Button>
    </div>
  );
}

/** A tappable row of the sheet: lead, title, meta and the chip "Allt hemma"; the tap expands it. */
function RowButton({
  expanded,
  onClick,
  lead,
  title,
  meta,
}: {
  expanded: boolean;
  onClick: () => void;
  lead?: ReactNode;
  title: string;
  meta: string;
}) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick} className="flex w-full min-w-0 items-center gap-3 p-3 text-left">
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-row-title break-words">{title}</span>
        <span className="text-meta text-ink-2">{meta}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap rounded-pill bg-mint px-2 py-1 text-meta font-semibold text-mint-ink">Allt hemma</span>
    </button>
  );
}
