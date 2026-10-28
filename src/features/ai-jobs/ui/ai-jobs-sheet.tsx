"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useAiJobs } from "@/lib/ai-jobs-client";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { errorMessages, isErrorCode, type AppError } from "@/lib/errors";
import { resultHref, statusText, subjectText } from "../domain/ai-job-text";

// The sheet AI-jobb (Story 12.4, EXPERIENCE.md, Component Patterns): one row
// per job, newest first, with what it is about and how it is going. A job in
// the queue or running has "Avbryt" (without a question: it can be started
// again), a finished one "Visa", and one that did not go the reason and
// "Försök igen" when that can be done from here. The word "jobb" is only in
// the title of the sheet and the job row.

const startPath = "/api/ai/jobs";

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function failureText(job: AiJob): string {
  return job.errorCode !== null && isErrorCode(job.errorCode) ? errorMessages[job.errorCode] : errorMessages.ai_unavailable;
}

export function AiJobsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { jobs, cancel, dismiss, reveal, start } = useAiJobs();
  const [error, setError] = useState<AppError | null>(null);

  // Nothing is marked as seen here: a result or a failure is seen on its own page.
  const shown = open ? jobs : [];

  function show(job: AiJob) {
    onClose();
    reveal(job.kind);
    router.push(resultHref(job.kind));
  }

  async function retry(job: AiJob) {
    setError(null);
    await dismiss(job.id);
    const started = await start(startPath, { kind: "suggest", avoidTitles: [] }, crypto.randomUUID());
    if (!started.ok) setError(started.error);
  }

  return (
    <Sheet open={open} onClose={onClose} title="AI-jobb">
      <div className="flex flex-col gap-3">
        {error ? <Notice role="alert">{error.message}</Notice> : null}
        {shown.length === 0 ? (
          <p className="text-body text-ink-2">Inga AI-jobb just nu.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-hairline">
            {shown.map((job) => (
              <li key={job.id} data-testid="ai-job" className="flex flex-col gap-1 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-row-title break-words text-ink">{capitalized(subjectText(job.kind))}</p>
                    <p className="text-meta text-ink-2">{statusText(job)}</p>
                  </div>
                  {isActive(job) ? (
                    <Button variant="text" aria-label={`Avbryt ${subjectText(job.kind)}`} onClick={() => void cancel(job.id)}>
                      Avbryt
                    </Button>
                  ) : job.status === "done" ? (
                    <Button variant="text" aria-label={`Visa ${subjectText(job.kind)}`} onClick={() => show(job)}>
                      Visa
                    </Button>
                  ) : null}
                </div>
                {job.status === "failed" ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-body break-words text-ink-2">{failureText(job)}</p>
                    {job.kind === "suggest" ? (
                      <Button variant="text" aria-label={`Försök igen med ${subjectText(job.kind)}`} onClick={() => void retry(job)}>
                        Försök igen
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
