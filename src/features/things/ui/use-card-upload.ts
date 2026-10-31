"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAiJobs } from "@/lib/ai-jobs-client";
import type { AiJob } from "@/lib/ai-job-shape";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, type AppError, type Result } from "@/lib/errors";
import { toDecodableImage } from "@/lib/heic";
import { maxPlacePhotoSide } from "@/lib/images";

// Sending cards (Story 18.11): every image becomes its own card and its own AI
// job, one after the other. At most three AI jobs are active (AD-28); when the
// queue is full the next image waits for a job to finish instead of failing, so
// a whole room can be chosen at once. The page is read again after each card,
// so it is there as soon as it is saved.

export type UploadState =
  | { kind: "idle" }
  | { kind: "sending"; done: number; total: number }
  | { kind: "sent"; count: number; skipped: string[] }
  | { kind: "error"; error: AppError; sent: number; skipped: string[] };

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
        // An iPhone photo (HEIC) a browser cannot read becomes a JPEG first (Story 18.16).
        const readable = await toDecodableImage(file);
        prepared = readable.ok ? await downscaleImage(readable.data, { maxSide: maxPlacePhotoSide }) : readable;
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

  /**
   * Sends the files in order; stops at the first that fails, except a HEIC that
   * could not be turned into JPEG: that one is skipped (and named in `skipped`)
   * and the rest go on. Returns how many were saved.
   */
  const send = useCallback(
    async (files: readonly File[], target: UploadTarget): Promise<number> => {
      if (busy.current || files.length === 0) return 0;
      busy.current = true;
      let sent = 0;
      const skipped: string[] = [];
      let skippedError: AppError | null = null;
      try {
        for (const [index, file] of files.entries()) {
          if (alive.current) setState({ kind: "sending", done: sent + skipped.length, total: files.length });
          const answer = await postOne(file, target);
          if (!answer.ok) {
            if (answer.error.code === "image_heic_failed") {
              skipped.push(file.name || `Bild ${index + 1}`);
              skippedError = answer.error;
              continue;
            }
            if (alive.current) setState({ kind: "error", error: answer.error, sent, skipped });
            onSaved();
            return sent;
          }
          sent += 1;
          onSaved();
        }
        if (alive.current) {
          setState(sent === 0 && skippedError ? { kind: "error", error: skippedError, sent, skipped } : { kind: "sent", count: sent, skipped });
        }
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
