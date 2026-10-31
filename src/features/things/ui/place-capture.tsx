"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import { PhotoRow } from "@/components/photo-row";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { useAiJobs, useOnAiJobsFinished, useShowingAiResults } from "@/lib/ai-jobs-client";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { downscaleImage } from "@/lib/downscale-image";
import { errorMessages, fail, isErrorCode, type AppError, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { cardFailureText, latestCardText, newCardText, pickText, readingText, retryText, type ThingPhotoStatus } from "../domain/thing-photo";

// Fota en plats (Story 18.2, FR-24): the camera row, "Välj bild" and the
// state of the card being read, on a place's page. On a phone the button opens
// the back camera and "Välj bild" the photo library (HEIC from an iPhone is
// decoded by the browser and sent as a JPEG); on a desktop the button opens the
// file picker. The photo is made small in the browser (AD-15) and posted as an
// AI job (kind `things`) that runs in the background, so Pontus can do other
// things meanwhile: the page reads itself again every few seconds while the
// card is being read, and when the job finishes. A card whose reading did not
// go stays, with a calm notice and "Försök igen", which reads the stored photo
// again.

export type PendingCard = { id: string; status: Extract<ThingPhotoStatus, "reading" | "failed">; errorCode: string | null };

export type PlaceCaptureProps = {
  placeId: string;
  /** The newest card when it is being read or failed, else `null`. */
  pending: PendingCard | null;
  /** When the finished card was taken, for the line "Senaste kort 31 okt"; `null` for none. */
  latestTakenAt: Date | null;
};

/** How often a page with a card being read reads itself again. */
const refreshMs = 3_000;

export function PlaceCapture({ placeId, pending, latestTakenAt }: PlaceCaptureProps) {
  const router = useRouter();
  const { start, jobs, markSeen } = useAiJobs();
  const touch = useCoarsePointer();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  // The photo is being made small and sent; the card does not exist yet.
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const reading = sending || pending?.status === "reading";

  // The results of this tab's jobs are on this page, so no confirmation says what is already here.
  useShowingAiResults("things");

  // The things of this place are seen here: their tab badge goes.
  useEffect(() => {
    for (const job of jobs) {
      if (job.kind === "things" && job.context.placeId === placeId && !job.seen && !isActive(job)) void markSeen(job.id);
    }
  }, [jobs, placeId, markSeen]);

  const refresh = useCallback(() => router.refresh(), [router]);
  useOnAiJobsFinished(
    useCallback(
      (finished: AiJob[]) => {
        if (finished.some((job) => job.kind === "things" && job.context.placeId === placeId)) router.refresh();
      },
      [router, placeId],
    ),
  );
  useEffect(() => {
    if (pending?.status !== "reading") return;
    const timer = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(timer);
  }, [pending?.status, refresh]);

  async function post(path: string, body: FormData | Record<string, unknown>) {
    let answer: Result<{ job: AiJob }>;
    try {
      answer = await start(path, body, crypto.randomUUID());
    } catch {
      answer = fail("ai_unavailable");
    }
    if (!answer.ok) setError(answer.error);
    // The card is saved before the job is queued: it is on the page now, read or not.
    router.refresh();
  }

  async function onChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || sending) return;
    // The time Pontus recognises for the card is when it was taken or chosen.
    const takenAt = new Date();
    setError(null);
    setSending(true);
    try {
      let prepared: Result<Blob>;
      try {
        prepared = await downscaleImage(file, { maxSide: maxPlacePhotoSide });
      } catch {
        prepared = fail("image_unsupported");
      }
      if (!prepared.ok) {
        setError(prepared.error);
        return;
      }
      const form = new FormData();
      form.append("image", prepared.data, "photo");
      form.append("place", placeId);
      form.append("takenAt", takenAt.toISOString());
      await post("/api/things/photo", form);
    } finally {
      setSending(false);
    }
  }

  async function retry() {
    if (!pending || sending) return;
    setError(null);
    setSending(true);
    try {
      await post("/api/things/retry", { card: pending.id });
    } finally {
      setSending(false);
    }
  }

  const failedCode = pending?.status === "failed" && pending.errorCode !== null && isErrorCode(pending.errorCode) ? pending.errorCode : null;
  let notice = null;
  if (error) {
    notice = <Notice role="alert">{errorMessages[error.code]}</Notice>;
  } else if (pending?.status === "failed" && !sending) {
    notice = (
      <Notice
        role="alert"
        action={
          <Button variant="text" onClick={retry}>
            {retryText}
          </Button>
        }
      >
        {cardFailureText(failedCode)}
      </Notice>
    );
  }

  return (
    <div data-testid="place-capture" className="flex flex-col gap-3">
      {notice}
      {/* Mounted empty, so the text is announced when it appears. */}
      <div role="status">
        {reading ? (
          <div className="flex flex-col gap-2">
            <p className="text-body text-ink">{readingText}</p>
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
              <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
            </div>
          </div>
        ) : null}
      </div>
      {reading ? null : (
        <>
          <PhotoRow title={newCardText} onClick={() => (touch ? cameraRef : pickerRef).current?.click()}>
            <p data-testid="place-latest-card" className="text-meta text-ink-3">
              {latestCardText(latestTakenAt)}
            </p>
          </PhotoRow>
          {touch ? (
            <Button variant="text" onClick={() => pickerRef.current?.click()} className="self-center">
              {pickText}
            </Button>
          ) : null}
        </>
      )}
      {touch ? (
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onChosen} />
      ) : null}
      <input ref={pickerRef} type="file" accept="image/*" tabIndex={-1} aria-hidden="true" className="sr-only" onChange={onChosen} />
    </div>
  );
}
