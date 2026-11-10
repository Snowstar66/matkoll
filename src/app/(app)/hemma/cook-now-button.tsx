"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { ChevronRightIcon, InfoIcon, SparkleIcon } from "@/components/icons";
import { FitRow } from "@/components/fit-row";
import type { PreferenceNote } from "@/components/preference-notes";
import { RecipeImage } from "@/components/recipe-image";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { eatFirstTipText } from "@/features/pantry";
import { recipeMetaText, stepText, type RecipeDraft } from "@/features/recipes";
import {
  dishSuggestionsSchema,
  nowIdeasResultSchema,
  suggestErrorMessage,
  toAvoidTitles,
  type CookNowOneMissing,
  type CookNowRecipe,
  type DishSuggestion,
  type NowIdeaView,
} from "@/features/suggestions";
import { isActive } from "@/lib/ai-job-shape";
import { useAiJobs, useShowingAiResults } from "@/lib/ai-jobs-client";
import { fail, isErrorCode, type AppError, type Result } from "@/lib/errors";

// "Vad kan jag laga nu?" (Story 25.2): the card at the top of Matvaror and the
// sheet "Kan lagas nu" it opens in place. The library's recipes come at once
// (readCookNow, no AI); the AI answers as a friend would (Story 25.4: a job of
// mode `ideas`): an intro and small text rows under "Idéer", with a calm loading
// row meanwhile. "Gör ett recept av den" writes the recipe of one idea (a job of
// mode `now` with the idea) and shows it with "Spara som recept". Everything is
// temporary: the result of the job is kept here in the browser for 30 minutes
// (so the sheet can be opened again at once), and the jobs are cancelled or
// dismissed when the sheet closes, so nothing piles up in the AI jobs. Nothing
// is saved without "Spara som recept".

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
  /** feedback.sendFeedback: "Stämmer inte" tells the Tyck till inbox that an idea was wrong. */
  sendFeedback: (input: { kind: "problem"; body: string; area: "matvaror"; page: string }) => Promise<Result<null>>;
};

/** An idea of the model as the sheet holds it, with a key of its own. */
type Idea = NowIdeaView & { key: number };

/** The recipe being written or written for an idea ("Gör ett recept av den"): a draft shown with "Spara som recept". */
type Recipe = { ideaKey: number; suggestion: DishSuggestion | null; recipeId: string };

/** The last result, kept for 30 minutes (per tab, never in storage). */
let kept: { siteId: string | null; at: number; intro: string; ideas: NowIdeaView[] } | null = null;

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
        className="flex min-h-14 w-full items-center gap-3 rounded-lg bg-mint px-4 py-2 text-left text-mint-ink"
      >
        <SparkleIcon size={22} className="shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-row-title">Vad kan jag laga nu?</span>
          <span className="text-meta opacity-80">Med det du har i kyl, frys och skafferi</span>
        </span>
        <ChevronRightIcon size={16} className="shrink-0" />
      </button>
      {opening > 0 ? <CookNowSheet key={opening} open={open} onClose={() => setOpen(false)} {...props} /> : null}
    </>
  );
}

/** Whether a job has reached an end, and which. */
const finishedOf = (job: { id: string; status: string } | undefined) =>
  job && (job.status === "done" || job.status === "failed" || job.status === "cancelled" || job.status === "superseded") ? job.id : null;

function CookNowSheet({ open, onClose, readCookNow, saveRecipe, sendFeedback }: CookNowButtonProps & { open: boolean; onClose: () => void }) {
  const { jobs, start, fetchResult, cancel, dismiss } = useAiJobs();
  const { showToast } = useToast();
  const [data, setData] = useState<CookNowData | null>(null);
  const [readError, setReadError] = useState<AppError | null>(null);
  const [intro, setIntro] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [jobError, setJobError] = useState<AppError | null>(null);
  const [starting, setStarting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // "Gör ett recept av den": one at a time, behind the ideas' own job.
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [recipeError, setRecipeError] = useState<AppError | null>(null);
  const [recipeStarting, setRecipeStarting] = useState(false);
  const [recipeJobId, setRecipeJobId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Ideas marked "Stämmer inte": hidden here and in the kept result. */
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set());
  const nextKey = useRef(0);
  const handled = useRef(new Set<string>());
  /** The names shown in this opening, so "Andra förslag" never repeats them. */
  const shownTitles = useRef<string[]>([]);
  const startKey = useRef<string | null>(null);
  const siteRef = useRef<string | null>(null);
  /** The jobs of this sheet, for the clean-up when it closes. */
  const live = useRef<{ ids: (string | null)[]; active: boolean[] }>({ ids: [], active: [] });

  const job = jobId ? jobs.find((candidate) => candidate.id === jobId) : undefined;
  const recipeJob = recipeJobId ? jobs.find((candidate) => candidate.id === recipeJobId) : undefined;
  const loading = starting || (job !== undefined && isActive(job));
  const jobActive = job !== undefined && isActive(job);
  const recipeLoading = recipeStarting || (recipeJob !== undefined && isActive(recipeJob));
  const recipeJobActive = recipeJob !== undefined && isActive(recipeJob);
  useEffect(() => {
    live.current = { ids: [jobId, recipeJobId], active: [jobActive, recipeJobActive] };
  });

  // The result is on the screen: no confirmation says it is done.
  useShowingAiResults("suggest", open);

  /** Starts a run of the model, avoiding `avoid`. */
  async function run(avoid: readonly string[]) {
    setStarting(true);
    setJobError(null);
    const clientKey = (startKey.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", mode: "ideas", avoidTitles: toAvoidTitles(avoid) }, clientKey);
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
        take(kept.intro, kept.ideas);
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
      const { ids, active } = live.current;
      ids.forEach((id, index) => {
        if (id && active[index]) void cancel(id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** The ideas of a result are shown, and the name of each is avoided by "Andra förslag". */
  function take(text: string, given: readonly NowIdeaView[]) {
    setIntro(text);
    setIdeas(given.map((idea) => ({ ...idea, key: ++nextKey.current })));
    shownTitles.current = given.map(({ name }) => name);
    setExpanded(null);
    setRecipe(null);
  }

  // The job is done: its ideas are fetched once, kept for 30 minutes, and the job is closed at once.
  const finishedId = finishedOf(job);
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
      const parsed = nowIdeasResultSchema.safeParse(result.data.result);
      if (!parsed.success) {
        setJobError(fail("ai_invalid").error);
        return;
      }
      kept = { siteId: siteRef.current, at: Date.now(), intro: parsed.data.intro, ideas: parsed.data.ideas };
      take(parsed.data.intro, parsed.data.ideas);
    })();
    // The functions of useAiJobs change with the list; the job's id is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedId, finishedStatus, finishedCode]);

  // The recipe job is done: its one dish is fetched and shown as a preview under the idea.
  const recipeFinishedId = finishedOf(recipeJob);
  const recipeFinishedStatus = recipeJob?.status;
  const recipeFinishedCode = recipeJob?.errorCode ?? null;
  useEffect(() => {
    if (!recipeFinishedId || handled.current.has(recipeFinishedId)) return;
    handled.current.add(recipeFinishedId);
    if (recipeFinishedStatus !== "done") {
      const code = recipeFinishedCode !== null && isErrorCode(recipeFinishedCode) ? recipeFinishedCode : "ai_unavailable";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- shows why a job that finished elsewhere did not go.
      setRecipeError(fail(code).error);
      void dismiss(recipeFinishedId);
      return;
    }
    void (async () => {
      const result = await fetchResult(recipeFinishedId);
      void dismiss(recipeFinishedId);
      if (!result.ok) {
        setRecipeError(result.error);
        return;
      }
      const parsed = dishSuggestionsSchema.safeParse(result.data.result);
      if (!parsed.success) {
        setRecipeError(fail("ai_invalid").error);
        return;
      }
      setRecipe((current) => (current ? { ...current, suggestion: parsed.data.suggestions[0] } : current));
    })();
    // The functions of useAiJobs change with the list; the job's id is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeFinishedId, recipeFinishedStatus, recipeFinishedCode]);

  function again() {
    if (loading) return;
    kept = null;
    setIdeas([]);
    setIntro("");
    setRecipe(null);
    void run(shownTitles.current);
  }

  /** "Gör ett recept av den": the existing one-dish recipe job (mode `now` with the idea), shown with "Spara som recept". */
  async function makeRecipe(idea: Idea) {
    if (recipeLoading || loading) return;
    setRecipe({ ideaKey: idea.key, suggestion: null, recipeId: crypto.randomUUID() });
    setRecipeError(null);
    setSaved(false);
    setRecipeStarting(true);
    const result = await start(
      "/api/ai/jobs",
      { kind: "suggest", mode: "now", avoidTitles: [], dish: `${idea.name}: ${idea.how}` },
      crypto.randomUUID(),
    );
    setRecipeStarting(false);
    if (!result.ok) {
      setRecipeError(result.error);
      return;
    }
    setRecipeJobId(result.data.job.id);
  }

  async function save(current: Recipe & { suggestion: DishSuggestion }) {
    const result = await saveRecipe(current.suggestion.draft, current.recipeId);
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      return;
    }
    setSaved(true);
    showToast(`${current.suggestion.draft.title} finns nu i Recept.`);
  }

  /** "Stämmer inte": the idea goes to the Tyck till inbox as a Fel, and is hidden. */
  async function wrong(idea: Idea) {
    const used = idea.uses.length > 0 ? idea.uses.join(", ") : "ingenting hemma";
    const sent = await sendFeedback({ kind: "problem", body: `Idé stämmer inte: ${idea.name} — använder: ${used}`, area: "matvaror", page: "/hemma" });
    if (!sent.ok) {
      showToast(sent.error.message, { role: "alert" });
      return;
    }
    setHidden((current) => new Set(current).add(idea.key));
    if (kept) kept = { ...kept, ideas: kept.ideas.filter((candidate) => candidate.name !== idea.name) };
    showToast("Tack, vi tittar på den.");
  }

  const toggle = (id: string) => setExpanded((current) => (current === id ? null : id));
  const shownIdeas = ideas.filter((idea) => !hidden.has(idea.key));
  const perfect = shownIdeas.filter((idea) => idea.missing.length === 0);
  const oneMissingIdeas = shownIdeas.filter((idea) => idea.missing.length === 1);
  const oneMissingCount = (data?.oneMissing.length ?? 0) + oneMissingIdeas.length;
  const own = data?.own ?? [];
  // UX-09: said before the ideas when none of the library's recipes can be cooked as they are.
  const noOwn = data !== null && own.length === 0;

  return (
    <Sheet open={open} onClose={onClose} title="Vad kan jag laga nu?" subtitle="Idéer med det du har hemma. Basvaror räknas som hemma." closeLabel="Klar">
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

        {noOwn ? (
          <p data-testid="cook-now-no-own" className="text-body text-ink-2">
            Inget av dina recept kan lagas helt just nu.
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
                  lead={<RecipeImage src={recipe.imageUrl} dish={recipe.dish} title={recipe.title} artSize={36} className="size-11 rounded-md" />}
                  title={recipe.title}
                  meta={recipeMetaText(recipe.totalMinutes, recipe.servings)}
                  notes={<FitRow notes={recipe.fit} />}
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
              IDÉER
            </h3>
            {perfect.length > 0 && intro ? (
              <p data-testid="cook-now-intro" className="text-body text-ink">
                {intro}
              </p>
            ) : null}
            {perfect.map((idea) => (
              <div key={idea.key} data-testid="cook-now-idea" className="flex flex-col items-start gap-1 rounded-lg bg-bg p-3">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-row-title break-words font-bold">{idea.name}</span>
                  <span className="text-meta text-ink-2">{idea.kind}</span>
                </p>
                <p className="text-body">{idea.how}</p>
                <FitRow notes={idea.fit} />
                {idea.why ? (
                  <p data-testid="cook-now-why" className="text-meta text-ink-3">
                    {idea.why}
                  </p>
                ) : null}
                {idea.uses.length > 0 ? (
                  <p data-testid="cook-now-uses" className="text-meta text-ink-3">
                    Använder: {idea.uses.join(", ")}
                  </p>
                ) : null}
                {recipe?.ideaKey !== idea.key ? (
                  <div className="-ml-1 flex flex-wrap items-center gap-x-3">
                    <button
                      type="button"
                      disabled={recipeLoading || loading}
                      onClick={() => void makeRecipe(idea)}
                      className="min-h-9 rounded-md px-1 text-row-title text-accent disabled:opacity-50"
                    >
                      Gör ett recept av den
                    </button>
                    <button type="button" onClick={() => void wrong(idea)} className="min-h-9 rounded-md px-1 text-meta text-ink-2">
                      Stämmer inte
                    </button>
                  </div>
                ) : (
                  <RecipePreview
                    loading={recipeLoading}
                    error={recipeError}
                    suggestion={recipe.suggestion}
                    saved={saved}
                    onRetry={() => void makeRecipe(idea)}
                    onSave={() => recipe.suggestion && void save({ ...recipe, suggestion: recipe.suggestion })}
                  />
                )}
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
                <MissingRow key={recipe.id} title={recipe.title} missing={recipe.missing} fit={recipe.fit} />
              ))}
              {oneMissingIdeas.map((idea) => (
                <MissingRow key={idea.key} title={idea.name} missing={idea.missing[0]} fit={idea.fit} />
              ))}
            </ul>
          </details>
        ) : null}

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

/** The recipe of an idea: a calm line while it is written, then the draft with "Spara som recept" (nothing is saved without it). */
function RecipePreview({
  loading,
  error,
  suggestion,
  saved,
  onRetry,
  onSave,
}: {
  loading: boolean;
  error: AppError | null;
  suggestion: DishSuggestion | null;
  saved: boolean;
  onRetry: () => void;
  onSave: () => void;
}) {
  return (
    <div data-testid="cook-now-recipe" className="flex w-full flex-col gap-3 pt-1">
      <div role="status">
        {loading ? <AiWorking inLiveRegion size="sm" steps={["Skriver receptet …", "Räknar ut mängderna …"]} /> : null}
      </div>
      {error && !loading ? (
        <div className="flex flex-col items-start gap-1">
          <p role="status" className="text-body text-ink-2">
            {error.code === "ai_invalid" ? "Det blev inget recept av den här gången." : suggestErrorMessage(error)}
          </p>
          <Button variant="compact" onClick={onRetry}>
            Försök igen
          </Button>
        </div>
      ) : null}
      {suggestion ? (
        <>
          <p className="text-row-title">{suggestion.draft.title}</p>
          <FitRow notes={suggestion.fit} />
          <ul className="flex flex-col gap-1.5">
            {suggestion.draft.lines.map((line, index) => (
              <li key={index} className="flex gap-2 text-body">
                <span aria-hidden="true" className="text-accent">
                  ✓
                </span>
                <span>{line.originalText}</span>
              </li>
            ))}
          </ul>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-body">
            {suggestion.draft.steps.map((step, index) => (
              <li key={index}>{stepText(step)}</li>
            ))}
          </ol>
          <Button variant="secondary" className="self-start" disabled={saved} onClick={onSave}>
            {saved ? "Sparad i Recept" : "Spara som recept"}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** "ägg", "ägg och mjölk", "ägg, mjölk och smör". */
function listNames(names: readonly string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

function MissingRow({ title, missing, fit }: { title: string; missing: string; fit?: readonly PreferenceNote[] }) {
  return (
    <li className="flex items-baseline justify-between gap-2">
      <span className="min-w-0 break-words">
        {title}
        <FitRow notes={fit} />
      </span>
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
  notes,
}: {
  expanded: boolean;
  onClick: () => void;
  lead?: ReactNode;
  title: string;
  meta: string;
  /** Hushållets preferenser under the meta line (PreferenceNotes); nothing for none. */
  notes?: ReactNode;
}) {
  return (
    <button type="button" aria-expanded={expanded} onClick={onClick} className="flex w-full min-w-0 items-center gap-3 p-3 text-left">
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-row-title break-words">{title}</span>
        <span className="text-meta text-ink-2">{meta}</span>
        {notes}
      </span>
      <span className="shrink-0 whitespace-nowrap rounded-pill bg-mint px-2 py-1 text-meta font-semibold text-mint-ink">Allt hemma</span>
    </button>
  );
}
