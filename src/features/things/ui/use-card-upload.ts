"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAiJobs } from "@/lib/ai-jobs-client";
import type { AiJob } from "@/lib/ai-job-shape";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, type AppError, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";

// Sending cards (Story 18.11): every image becomes its own card and its own AI
// job, one after the other. At most three AI jobs are active (AD-28); when the
// queue is full the next image waits for a job to finish instead of failing, so
// a whole room can be chosen at once. The page is read again after each card,
// so it is there as soon as it is saved.

export type UploadState =
  | { kind: "idle" }
  | { kind: "sending"; done: number; total: number }
  | { kind: "sent"; count: number }
  | { kind: "error"; error: AppError; sent: number };

export type UploadTarget = { placeId: string; replaces?: string };

/** How long the next image waits when three jobs are active, and how many times it tries. */
const queueWaitMs = 4_000;
const queueTries = 60;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function useCardUpload(onSaved: () => void) {
  const { start } = useAiJobs();
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const postOne = useCallback(
    async (file: File, target: UploadTarget): Promise<Result<{ job: AiJob }>> => {
      // The time Pontus recognises for the card is when it was taken or chosen.
      const takenAt = new Date();
      let prepared: Result<Blob>;
      try {
        prepared = await downscaleImage(file, { maxSide: maxPlacePhotoSide });
      } catch {
        prepared = fail("image_unsupported");
      }
      if (!prepared.ok) return prepared;
      const clientKey = crypto.randomUUID();
      for (let attempt = 0; attempt < queueTries; attempt++) {
        const form = new FormData();
        form.append("image", prepared.data, "photo");
        form.append("place", target.placeId);
        form.append("takenAt", takenAt.toISOString());
        if (target.replaces) form.append("replaces", target.replaces);
        let answer: Result<{ job: AiJob }>;
        try {
          answer = await start("/api/things/photo", form, clientKey);
        } catch {
          answer = fail("ai_unavailable");
        }
        if (answer.ok || answer.error.code !== "ai_queue_full" || !alive.current) return answer;
        await sleep(queueWaitMs);
      }
      return fail("ai_queue_full");
    },
    [start],
  );

  /** Sends the files in order; stops at the first that fails. Returns how many were saved. */
  const send = useCallback(
    async (files: readonly File[], target: UploadTarget): Promise<number> => {
      if (busy.current || files.length === 0) return 0;
      busy.current = true;
      let sent = 0;
      try {
        for (const file of files) {
          if (alive.current) setState({ kind: "sending", done: sent, total: files.length });
          const answer = await postOne(file, target);
          if (!answer.ok) {
            if (alive.current) setState({ kind: "error", error: answer.error, sent });
            onSaved();
            return sent;
          }
          sent += 1;
          onSaved();
        }
        if (alive.current) setState({ kind: "sent", count: sent });
        return sent;
      } finally {
        busy.current = false;
      }
    },
    [postOne, onSaved],
  );

  const clear = useCallback(() => setState({ kind: "idle" }), []);
  return { state, send, clear, setState };
}
