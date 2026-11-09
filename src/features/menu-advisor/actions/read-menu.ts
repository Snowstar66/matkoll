import { type AiCallResult, postAiForm, toResult } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, isErrorCode, ok, type Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import { createMenuStreamParser, menuStreamContentType, type MenuReading as FullReading, type MenuStreamEvent } from "../domain/reading";

// The menu photo's way to POST /api/menu/read (AD-9): not a Server Action, since AI is only called from route handlers.
// The photo is made small in the browser first (2048 px on the longest side, as the route allows) and is only held in memory.

/** A reading; `model` and `effort` (who read it) are there from the server, and may be missing in older fixtures. */
export type MenuReading = Omit<FullReading, "model" | "effort"> & Partial<Pick<FullReading, "model" | "effort">>;

/** The photo at most 2048 px on its longest side, as JPEG; fails with a Swedish text when it cannot be decoded. */
export function prepareMenuPhoto(file: Blob): Promise<Result<Blob>> {
  return downscaleImage(file, { maxSide: maxPlacePhotoSide });
}

/** Reads the prepared photo; `careful` asks for the slower, more thorough reading. */
export function readMenuPhoto(photo: Blob, quality: "standard" | "careful", signal: AbortSignal): Promise<AiCallResult<MenuReading>> {
  const body = new FormData();
  body.set("image", photo, "menu.jpg");
  body.set("quality", quality);
  return postAiForm<MenuReading>("/api/menu/read", body, signal);
}

/**
 * The live reading: POST /api/menu/read?stream=1. `onEvent` gets each line as it arrives (`reading`, `language`, one
 * `dish` at a time, see MenuStreamEvent); the result is the final `done` reading, or the same failure as readMenuPhoto
 * (a failure before the first line is plain JSON with a status; one after it is an `error` line). Aborting `signal`
 * gives `{ aborted: true }`.
 */
export async function readMenuPhotoLive(
  photo: Blob,
  quality: "standard" | "careful",
  signal: AbortSignal,
  onEvent: (event: MenuStreamEvent) => void,
): Promise<AiCallResult<MenuReading>> {
  const body = new FormData();
  body.set("image", photo, "menu.jpg");
  body.set("quality", quality);
  try {
    const response = await fetch("/api/menu/read?stream=1", { method: "POST", headers: { accept: menuStreamContentType }, body, signal });
    if (!response.headers.get("content-type")?.startsWith(menuStreamContentType) || !response.body) return toResult<MenuReading>(await response.json());
    const parser = createMenuStreamParser();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    let outcome: Result<MenuReading> | null = null;
    const handle = (events: MenuStreamEvent[]) => {
      for (const event of events) {
        onEvent(event);
        if (event.type === "done") {
          outcome = ok({ menu: event.menu, quality: event.quality, escalated: event.escalated, model: event.model, effort: event.effort });
        } else if (event.type === "error") outcome = fail(isErrorCode(event.code) ? event.code : "ai_unavailable");
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      handle(parser.push(decoder.decode(value, { stream: true })));
    }
    handle(parser.push(decoder.decode()));
    handle(parser.end());
    return outcome ?? fail("ai_unavailable");
  } catch {
    return signal.aborted ? { ok: false, aborted: true } : fail("ai_unavailable");
  }
}
