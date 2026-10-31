"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { useOnAiJobsFinished, useShowingAiResults } from "@/lib/ai-jobs-client";
import type { AiJob } from "@/lib/ai-job-shape";

/**
 * Förråd's start page reads itself again when a card is read in the background,
 * so a room's counts and "Tittar på kortet …" are up to date (before Story 18.21
 * the "Ta kort" row on this page did it). Renders nothing.
 */
export function RoomsRefresh() {
  const router = useRouter();
  // The results of this tab's jobs are shown by the page that reads itself again, so no confirmation says what is already there.
  useShowingAiResults("things");
  useOnAiJobsFinished(
    useCallback(
      (finished: AiJob[]) => {
        if (finished.some((job) => job.kind === "things")) router.refresh();
      },
      [router],
    ),
  );
  return null;
}
