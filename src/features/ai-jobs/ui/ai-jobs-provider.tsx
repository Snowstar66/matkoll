"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import {
  AiJobActionsContext,
  aiJobsClient,
  useAiJobs,
  useAiJobsPolling,
  useOnAiJobsFinished,
  type AiJobActions,
} from "@/lib/ai-jobs-client";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { cancelAiJob, dismissAiJob, markAiJobSeen } from "../actions/job-actions";
import { finishedText, resultHref, severalFinishedText } from "../domain/ai-job-text";
import { AiJobsSheet } from "./ai-jobs-sheet";

// The AI jobs of the app (Story 12.4, FR-46-FR-48, AD-28), rendered once by
// the layout of the signed-in part. It starts the client's polling, gives
// Avbryt, sett and stäng to useAiJobs(), says once when a job has started or
// is finished, and holds the sheet AI-jobb that the job row opens. Nothing
// here is shown by itself: the job row (ai-job-row.tsx) and the tab badge
// (src/components/app-shell) are where the jobs are on the screen.

type SheetApi = { open: () => void };
const SheetContext = createContext<SheetApi | null>(null);

/** Opens the sheet AI-jobb; needs `AiJobsProvider` above. */
export function useAiJobsSheet(): SheetApi {
  const api = useContext(SheetContext);
  if (!api) throw new Error("useAiJobsSheet needs an AiJobsProvider");
  return api;
}

/** What the live region says when a job starts (EXPERIENCE.md, Accessibility). */
export function startedText(job: Pick<AiJob, "status">): string {
  return job.status === "queued" ? "AI-jobbet står i kön." : "AI-jobbet har startat.";
}

export function AiJobsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { jobs, loaded, reveal } = useAiJobs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [announcement, setAnnouncement] = useState({ id: 0, text: "" });
  /** The jobs that were active before, so only a new one is announced, never a poll. */
  const knownActive = useRef<Set<string> | null>(null);

  useAiJobsPolling();

  const actions = useMemo<AiJobActions>(
    () => ({ cancel: cancelAiJob, markSeen: markAiJobSeen, dismiss: dismissAiJob }),
    [],
  );
  const sheet = useMemo<SheetApi>(() => ({ open: () => setSheetOpen(true) }), []);

  // A job that starts is read out once. What was active when the app loaded is not "new".
  useEffect(() => {
    if (!loaded) return;
    const active = jobs.filter(isActive);
    const known = knownActive.current;
    knownActive.current = new Set(active.map((job) => job.id));
    if (known === null) return;
    const started = active.find((job) => !known.has(job.id));
    if (started) setAnnouncement((before) => ({ id: before.id + 1, text: startedText(started) }));
  }, [jobs, loaded]);

  // Finished jobs: a short confirmation with "Visa", except for a result that is on the screen.
  const onFinished = useCallback(
    (finished: AiJob[]) => {
      const client = aiJobsClient();
      const news = finished.filter((job) => !client.isShowing(job.kind));
      if (news.length === 0) return;
      const [only] = news;
      if (news.length === 1) {
        showToast(finishedText(only), {
          waitForUndo: true,
          show: {
            onShow: () => {
              reveal(only.kind);
              router.push(resultHref(only.kind));
            },
          },
        });
        return;
      }
      showToast(severalFinishedText(news.length), { waitForUndo: true, show: { onShow: () => setSheetOpen(true) } });
    },
    [reveal, router, showToast],
  );
  useOnAiJobsFinished(onFinished);

  return (
    <AiJobActionsContext.Provider value={actions}>
      <SheetContext.Provider value={sheet}>
        {children}
        {/* Mounted empty, so a new text is announced; never a focus change. */}
        <div role="status" aria-live="polite" className="sr-only">
          {/* Keyed, so the same text for the next job is announced again. */}
          {announcement.text ? <span key={announcement.id}>{announcement.text}</span> : null}
        </div>
        <AiJobsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      </SheetContext.Provider>
    </AiJobActionsContext.Provider>
  );
}
