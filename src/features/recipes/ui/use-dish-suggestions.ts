"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { dishSuggestionsSchema, toAvoidTitles, type DishSuggestion } from "@/features/suggestions";
import { type AiJob, isActive } from "@/lib/ai-job-shape";
import { useAiJobs, useShowingAiResults } from "@/lib/ai-jobs-client";
import { fail, isErrorCode, type AppError } from "@/lib/errors";

// The state of AI-förslag (FR-23, FR-46-FR-49), held by the library so the
// suggestions stay while the pills change, as long as /recept is open. The AI
// works as a job in the background (Story 12.4, AD-28): "Föreslå rätter med
// AI" starts one and the library goes on; the job survives a page change and a
// reload, and its result is shown here when it is done, also when Pontus comes
// back. The suggestions are only held here and in the job's result (never in
// localStorage, the address or another table) until Pontus saves one. The AI
// is only asked when Pontus presses the button.

/**
 * A suggestion as shown, with a key of its own for the list and the sheet,
 * and the id it gets when saved, made when it arrives: saving it again after
 * a lost answer, also from a sheet opened anew, never makes a copy.
 */
export type ShownSuggestion = DishSuggestion & { key: number; recipeId: string };

export type DishSuggestionsState = {
  /** The suggestions as they are, also when they are of another place (see `stale`). */
  suggestions: ShownSuggestion[];
  /** Story 9.5: `offers` when the suggestions were built around this week's offers. */
  mode: "pantry" | "offers";
  /** Story 9.14: the store the offers suggestions are from, when Pontus picked one of several. */
  storeName: string | null;
  /** A job is being started, waits in the queue or runs. */
  loading: boolean;
  /** While the job waits behind others: "I kö, 1 före."; otherwise null. */
  waiting: string | null;
  /** Why the last job failed or could not be started; the suggestions from before stay. */
  error: AppError | null;
  /** Set while the suggestions are of another place than the library shows (AD-24): `siteName` is that place's, if known. */
  stale: { siteName: string | null } | null;
  /** Increases when new suggestions arrive, so the section can move focus to its heading. */
  arrivals: number;
  /** Increases when "Avbryt" stops a job, so the button can take focus back. */
  cancels: number;
  /** A finished suggestion job that has not been shown yet: the page reveals it. */
  unseenResult: boolean;
  /** The list of jobs has been read, so `unseenResult` says what is true. */
  jobsLoaded: boolean;
  /** Increases when Pontus asks to see the result ("Visa" in the confirmation). */
  reveals: number;
  /** "Föreslå rätter med AI", "Föreslå andra rätter", "Föreslå igen" and "Försök igen": asks for new suggestions. */
  suggest: () => void;
  /** "Avbryt": stops the job; nothing is shown for it and the suggestions from before stay. */
  cancel: () => void;
  /** A saved suggestion leaves the section; its title is still avoided by "Föreslå andra rätter". */
  remove: (key: number) => void;
};

export type DishSuggestionsOptions = {
  /**
   * The section is on the screen: only then is a finished job shown, and so
   * counted as seen (the tab's badge goes), and no confirmation says what is
   * already there.
   */
  visible?: boolean;
  /** The names of Pontus's places by id, for "Förslagen bygger på lagret för Hemma." */
  siteNames?: Readonly<Record<string, string>>;
};

/** The newest job of AI-förslag that matches. */
function latest(jobs: readonly AiJob[], match: (job: AiJob) => boolean): AiJob | undefined {
  return jobs
    .filter((job) => job.kind === "suggest" && match(job))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

/**
 * `shownSiteId` is the place the library counts its status against (AD-24).
 * Suggestions are kept with the place they were suggested from. When the
 * library shows another place (a place selected elsewhere) they are still
 * shown, with the line "Förslagen bygger på lagret för Hemma." and "Föreslå
 * igen" (`stale`), and can be saved as before. A `null` on either side (no
 * place, or a pantry that could not be read) says nothing.
 */
export function useDishSuggestions(
  shownSiteId: string | null = null,
  { visible = true, siteNames }: DishSuggestionsOptions = {},
): DishSuggestionsState {
  const router = useRouter();
  const { jobs, loaded, start, cancel: cancelJob, markSeen, dismiss, fetchResult, reveals } = useAiJobs();
  const [made, setMade] = useState<{
    suggestions: ShownSuggestion[];
    siteId: string | null;
    jobId: string | null;
    mode: "pantry" | "offers";
    storeName: string | null;
  }>({
    suggestions: [],
    mode: "pantry",
    storeName: null,
    siteId: null,
    jobId: null,
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [arrivals, setArrivals] = useState(0);
  const [cancels, setCancels] = useState(0);
  const nextKey = useRef(0);
  /** Titles of saved suggestions, newest first. */
  const savedTitles = useRef<string[]>([]);
  /** The key of the tap that is on its way, kept for a new try after a network error (the server makes one job of it). */
  const startKey = useRef<string | null>(null);
  /** "Avbryt" while the job is being started: it is cancelled when its id is known. */
  const cancelOnStart = useRef(false);
  /** The finished jobs that have been shown here, so none is shown twice. */
  const handled = useRef(new Set<string>());

  const active = latest(jobs, isActive);
  const unseen = latest(jobs, (job) => (job.status === "done" || job.status === "failed") && !job.seen);
  const loading = starting || active !== undefined;
  const waiting = active?.status === "queued" && active.ahead > 0 ? `I kö, ${active.ahead} före.` : null;

  // The result is on the screen: no confirmation for it, and it is counted as seen below.
  useShowingAiResults("suggest", visible);

  // A finished job is shown when the section is: its suggestions, or why it did not go.
  const unseenId = unseen?.id;
  const unseenStatus = unseen?.status;
  const unseenCode = unseen?.errorCode ?? null;
  useEffect(() => {
    if (!visible || !unseenId || handled.current.has(unseenId)) return;
    handled.current.add(unseenId);
    if (unseenStatus === "failed") {
      const code = unseenCode !== null && isErrorCode(unseenCode) ? unseenCode : "ai_unavailable";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- shows the failure of a job that finished elsewhere.
      setError(fail(code).error);
      // The failure is shown here, so the job has done its part.
      void dismiss(unseenId);
      return;
    }
    void (async () => {
      const result = await fetchResult(unseenId);
      if (!result.ok) {
        setError(result.error);
        // A result that is gone (older than 24 hours, or closed on another device) is said so, and the job is not shown
        // again. Any other failure (the network) leaves the job unseen, to be tried again when the section is shown.
        if (result.error.code === "ai_job_gone") void markSeen(unseenId);
        else handled.current.delete(unseenId);
        return;
      }
      const parsed = dishSuggestionsSchema.safeParse(result.data.result);
      if (!parsed.success) {
        setError(fail("ai_invalid").error);
        void dismiss(unseenId);
        return;
      }
      // New suggestions replace the old ones only now that they are here.
      setError(null);
      setMade({
        siteId: parsed.data.siteId,
        mode: parsed.data.mode,
        storeName: parsed.data.storeName,
        jobId: unseenId,
        suggestions: parsed.data.suggestions.map((suggestion) => ({
          ...suggestion,
          key: ++nextKey.current,
          recipeId: crypto.randomUUID(),
        })),
      });
      setArrivals((count) => count + 1);
      void markSeen(unseenId);
    })();
    // The functions of useAiJobs change with the list; the job's id is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, unseenId, unseenStatus, unseenCode]);

  const stale = useMemo(() => {
    if (made.siteId === null || shownSiteId === null || made.siteId === shownSiteId) return null;
    return { siteName: siteNames?.[made.siteId] ?? null };
  }, [made.siteId, shownSiteId, siteNames]);

  async function suggest() {
    // One job at a time: the server gives back an active one, but nothing new is started from here.
    if (loading) return;
    setStarting(true);
    setError(null);
    cancelOnStart.current = false;

    // The titles shown, then those saved, so the model suggests something new
    // ("Föreslå andra rätter"), cleaned and cut to what the server takes. For
    // another place everything is new.
    const avoidTitles = stale
      ? []
      : toAvoidTitles([...made.suggestions.map(({ draft }) => draft.title), ...savedTitles.current]);
    const key = (startKey.current ??= crypto.randomUUID());
    const result = await start("/api/ai/jobs", { kind: "suggest", avoidTitles }, key);
    setStarting(false);
    if (!result.ok) {
      // A network error may be tried again with the same key; any other answer is final for this tap.
      if (result.error.code !== "ai_unavailable") startKey.current = null;
      // An expired session: the page sends Pontus to sign in.
      if (result.error.code === "unauthorized") router.refresh();
      setError(result.error);
      return;
    }
    startKey.current = null;
    // The old result is closed when the new job has started: it is not wanted any more.
    if (made.jobId) void dismiss(made.jobId);
    setMade((current) => ({ ...current, jobId: null }));
    if (cancelOnStart.current) {
      cancelOnStart.current = false;
      void cancelJob(result.data.job.id);
    }
  }

  function cancel() {
    if (starting) {
      cancelOnStart.current = true;
      setCancels((count) => count + 1);
      return;
    }
    if (!active) return;
    void cancelJob(active.id);
    setCancels((count) => count + 1);
  }

  function remove(key: number) {
    const saved = made.suggestions.find((suggestion) => suggestion.key === key);
    if (saved) savedTitles.current = [saved.draft.title, ...savedTitles.current];
    const left = made.suggestions.filter((suggestion) => suggestion.key !== key);
    setMade((current) => ({ ...current, suggestions: left }));
    // The last one is saved: the result has done its part.
    if (left.length === 0 && made.jobId) {
      void dismiss(made.jobId);
      setMade((current) => ({ ...current, jobId: null }));
    }
  }

  return {
    suggestions: made.suggestions,
    mode: made.mode,
    storeName: made.storeName,
    loading,
    waiting,
    error,
    stale,
    arrivals,
    cancels,
    unseenResult: unseen !== undefined,
    jobsLoaded: loaded,
    reveals: reveals.suggest,
    suggest: () => void suggest(),
    cancel,
    remove,
  };
}
