"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { z } from "zod";
import { aiJobSchema, isActive, isFinishedWithNews, type AiJob, type AiJobKind } from "./ai-job-shape";
import { toResult } from "./ai-client";
import { fail, ok, type Result } from "./errors";

// The client's way to AI jobs (Story 12.4, FR-46-FR-48, AD-28): starts a job
// with POST /api/ai/jobs, and keeps the list of the jobs the app shows with
// polling. No Supabase client in the browser and no Realtime (AD-2): the list
// is read with GET /api/ai/jobs every two seconds while some job is queued or
// running and the tab is visible, once when the tab is shown again, and once
// when the app loads. A result is fetched once with GET /api/ai/jobs/[id].
// The state is shared by every component with useAiJobs() (useSyncExternalStore).
// Nothing of a job is kept in localStorage, sessionStorage or IndexedDB.

/** How often the list is read while a job is active. */
export const pollIntervalMs = 2_000;

/** A job that was just started is kept in the list this long, if a read that was on its way misses it. */
const justStartedMs = 10_000;

export type AiJobsSnapshot = {
  /** The jobs the app shows: active ones, and finished ones that have not been seen. Newest first. */
  jobs: readonly AiJob[];
  /** The list has been read at least once, so "no jobs" is known to be true. */
  loaded: boolean;
  /** How many times each kind of result was asked to be shown ("Visa"), so its page can reveal it. */
  reveals: Readonly<Record<AiJobKind, number>>;
};

const noReveals = { suggest: 0, analyze: 0, import: 0, things: 0 } as const;
const emptySnapshot: AiJobsSnapshot = { jobs: [], loaded: false, reveals: noReveals };

const listAnswerSchema = z.object({ jobs: z.array(aiJobSchema) });
const startAnswerSchema = z.object({ job: aiJobSchema });
const resultAnswerSchema = z.object({ job: aiJobSchema, result: z.unknown() });

/** What the client needs from the browser, so polling can be tried with a fake clock. */
export type AiJobsEnv = {
  fetch: typeof fetch;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  visible: () => boolean;
  /** Calls `listener` when the tab is shown or hidden; returns how to stop. */
  onVisibilityChange: (listener: () => void) => () => void;
};

export type AiJobsClient = ReturnType<typeof createAiJobsClient>;

export function createAiJobsClient(env: AiJobsEnv) {
  let snapshot: AiJobsSnapshot = emptySnapshot;
  const listeners = new Set<() => void>();
  const finishedListeners = new Set<(jobs: AiJob[]) => void>();
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;
  /** Counts the reads, so an older answer never replaces a newer state. */
  let reads = 0;
  /** Jobs this tab started a moment ago, which a read on its way may not have seen. */
  const justStarted = new Map<string, { job: AiJob; at: number }>();
  /** Jobs the person has cancelled, closed or seen here, which an older answer must not bring back. */
  const settled = new Map<string, "seen" | "gone">();
  /** The kinds whose result is on the screen now, so no confirmation says what is already there. */
  const showing = new Map<AiJobKind, number>();

  function emit() {
    for (const listener of listeners) listener();
  }

  function set(next: Partial<AiJobsSnapshot>) {
    snapshot = { ...snapshot, ...next };
    emit();
  }

  /** The jobs of a read, with what is known here and the read does not yet show. */
  function reconcile(read: readonly AiJob[]): AiJob[] {
    const now = env.now();
    const jobs = new Map<string, AiJob>();
    for (const job of read) {
      const settledAs = settled.get(job.id);
      if (settledAs === "gone") continue;
      jobs.set(job.id, settledAs === "seen" ? { ...job, seen: true } : job);
    }
    for (const [id, { job, at }] of justStarted) {
      if (now - at > justStartedMs) justStarted.delete(id);
      else if (!jobs.has(id) && !settled.has(id)) jobs.set(id, job);
    }
    return [...jobs.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : -1));
  }

  function schedule() {
    if (timer !== null || !env.visible() || !snapshot.jobs.some(isActive)) return;
    timer = env.setTimeout(() => {
      timer = null;
      void refresh().then(schedule);
    }, pollIntervalMs);
  }

  function stopTimer() {
    if (timer === null) return;
    env.clearTimeout(timer);
    timer = null;
  }

  async function read(): Promise<void> {
    const sequence = ++reads;
    let jobs: AiJob[];
    try {
      const response = await env.fetch("/api/ai/jobs", { headers: { accept: "application/json" }, cache: "no-store" });
      const result = toResult<unknown>(await response.json());
      const parsed = result.ok ? listAnswerSchema.safeParse(result.data) : null;
      // A failed read (offline, a deploy, an expired session) changes nothing; the next one tries again.
      if (!parsed?.success) return;
      jobs = parsed.data.jobs;
    } catch {
      return;
    }
    if (sequence !== reads) return;

    const before = new Map(snapshot.jobs.map((job) => [job.id, job]));
    const next = reconcile(jobs);
    const finished = next.filter((job) => {
      const earlier = before.get(job.id);
      return earlier !== undefined && isActive(earlier) && isFinishedWithNews(job);
    });
    set({ jobs: next, loaded: true });
    if (finished.length > 0) for (const listener of finishedListeners) listener(finished);
  }

  /** Reads the list now. A read already on its way is joined, not repeated. */
  function refresh(): Promise<void> {
    inFlight ??= read().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: (): AiJobsSnapshot => snapshot,

    /**
     * Starts the client: reads the list once, and again when the tab is
     * shown. Returns how to stop. A tab that is hidden does not poll.
     */
    init(): () => void {
      void refresh().then(schedule);
      const stop = env.onVisibilityChange(() => {
        if (env.visible()) void refresh().then(schedule);
        else stopTimer();
      });
      return () => {
        stop();
        stopTimer();
      };
    },
    refresh,

    /**
     * Starts a job: POST `path` with `body` (JSON, or a form with a photo)
     * and the `clientKey`. The same key again gives the same job, so a
     * retry after a network error never makes a second one. `ai_unavailable`
     * for a network error or an answer that is not the Result shape.
     */
    async start(path: string, body: Record<string, unknown> | FormData, clientKey: string): Promise<Result<{ job: AiJob }>> {
      try {
        let init: RequestInit;
        if (body instanceof FormData) {
          body.set("clientKey", clientKey);
          init = { method: "POST", body };
        } else {
          init = {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, clientKey }),
          };
        }
        const response = await env.fetch(path, { ...init, headers: { ...init.headers, accept: "application/json" } });
        const result = toResult<unknown>(await response.json());
        if (!result.ok) return result;
        const parsed = startAnswerSchema.safeParse(result.data);
        if (!parsed.success) return fail("ai_unavailable");
        const { job } = parsed.data;
        settled.delete(job.id);
        justStarted.set(job.id, { job, at: env.now() });
        set({ jobs: reconcile([...snapshot.jobs.filter((other) => other.id !== job.id), job]), loaded: true });
        schedule();
        return ok({ job });
      } catch {
        return fail("ai_unavailable");
      }
    },

    /** The whole result of a finished job, once (GET /api/ai/jobs/[id]); `ai_job_gone` when it is not there any more. */
    async fetchResult(id: string): Promise<Result<{ job: AiJob; result: unknown }>> {
      try {
        const response = await env.fetch(`/api/ai/jobs/${encodeURIComponent(id)}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        const result = toResult<unknown>(await response.json());
        if (!result.ok) return result;
        const parsed = resultAnswerSchema.safeParse(result.data);
        return parsed.success ? ok(parsed.data) : fail("ai_unavailable");
      } catch {
        return fail("ai_unavailable");
      }
    },

    /**
     * What the person did to a job here, shown at once without waiting for
     * the next read: its result has been `seen`, or the job is `gone` (cancelled or closed).
     */
    settle(id: string, change: "seen" | "gone"): void {
      settled.set(id, change);
      justStarted.delete(id);
      set({
        jobs:
          change === "gone"
            ? snapshot.jobs.filter((job) => job.id !== id)
            : snapshot.jobs.map((job) => (job.id === id ? { ...job, seen: true } : job)),
      });
    },

    /** The people asks to see the result of a kind ("Visa"): its page reveals it. */
    reveal(kind: AiJobKind): void {
      set({ reveals: { ...snapshot.reveals, [kind]: snapshot.reveals[kind] + 1 } });
    },

    /** Called with the jobs that went from active to done or failed since the last read here. */
    onFinished(listener: (jobs: AiJob[]) => void): () => void {
      finishedListeners.add(listener);
      return () => finishedListeners.delete(listener);
    },

    /** The result of `kind` is on the screen (until the returned function is called). */
    markShowing(kind: AiJobKind): () => void {
      showing.set(kind, (showing.get(kind) ?? 0) + 1);
      return () => {
        const count = (showing.get(kind) ?? 1) - 1;
        if (count <= 0) showing.delete(kind);
        else showing.set(kind, count);
      };
    },
    isShowing: (kind: AiJobKind): boolean => showing.has(kind),
  };
}

function browserEnv(): AiJobsEnv {
  return {
    fetch: (input, init) => window.fetch(input, init),
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    visible: () => document.visibilityState === "visible",
    onVisibilityChange: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

let browserClient: AiJobsClient | undefined;

/** The one client of this tab. Only in the browser. */
export function aiJobsClient(): AiJobsClient {
  browserClient ??= createAiJobsClient(browserEnv());
  return browserClient;
}

/** Forgets the tab's client, for tests. */
export function resetAiJobsClient(): void {
  browserClient = undefined;
}

/** What Pontus can do to a job: the Server Actions of the ai-jobs module, given by its provider (AD-28). */
export type AiJobActions = {
  cancel: (id: string) => Promise<Result<null>>;
  markSeen: (id: string) => Promise<Result<null>>;
  dismiss: (id: string) => Promise<Result<null>>;
};

export const AiJobActionsContext = createContext<AiJobActions | null>(null);

/** The result of `kind` is on the screen while `shown` is true: no confirmation for it, and it is the page's to mark as seen. */
export function useShowingAiResults(kind: AiJobKind, shown = true): void {
  useEffect(() => {
    if (!shown) return;
    return aiJobsClient().markShowing(kind);
  }, [kind, shown]);
}

export type AiJobs = {
  jobs: readonly AiJob[];
  loaded: boolean;
  reveals: AiJobsSnapshot["reveals"];
  start: AiJobsClient["start"];
  fetchResult: AiJobsClient["fetchResult"];
  /** "Avbryt": the job leaves the list at once, and the server stops it. */
  cancel: (id: string) => Promise<void>;
  /** The result has been shown: the tab's badge goes. */
  markSeen: (id: string) => Promise<void>;
  /** The result is closed or saved: the job is removed. */
  dismiss: (id: string) => Promise<void>;
  reveal: AiJobsClient["reveal"];
};

/**
 * The AI jobs of the app (FR-46-FR-48): the list that is kept by polling,
 * and what can be done to a job. Needs `AiJobsProvider` above for the
 * actions; the list works without it.
 */
export function useAiJobs(): AiJobs {
  const client = aiJobsClient();
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, () => emptySnapshot);
  const actions = useContext(AiJobActionsContext);
  return {
    jobs: state.jobs,
    loaded: state.loaded,
    reveals: state.reveals,
    start: client.start,
    fetchResult: client.fetchResult,
    reveal: client.reveal,
    async cancel(id) {
      client.settle(id, "gone");
      await actions?.cancel(id);
    },
    async markSeen(id) {
      client.settle(id, "seen");
      await actions?.markSeen(id);
    },
    async dismiss(id) {
      client.settle(id, "gone");
      await actions?.dismiss(id);
    },
  };
}

/** Called when jobs finish while this tab is open (for the confirmation). */
export function useOnAiJobsFinished(listener: (jobs: AiJob[]) => void): void {
  useEffect(() => aiJobsClient().onFinished(listener), [listener]);
}

/** Starts the client for the app: reads the list now, and polls while a job is active. */
export function useAiJobsPolling(): void {
  useEffect(() => aiJobsClient().init(), []);
}
