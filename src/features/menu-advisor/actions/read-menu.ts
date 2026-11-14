import { type AiCallResult, postAiForm, toResult } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, isErrorCode, ok, type Result } from "@/lib/errors";
import { maxPlacePhotoSide, menuPhotosBudgetBytes } from "@/lib/images";
import { createMenuStreamParser, menuStreamContentType, type MenuReading as FullReading, type MenuStreamEvent } from "../domain/reading";

// The menu photos' way to POST /api/menu/read (AD-9): not a Server Action, since AI is only called from route handlers.
// Each photo (a page of the menu) is made small in the browser first (2048 px on the longest side, as the route
// allows), the pages together are fitted to one request (fitMenuPhotos), and they are only held in memory.

/** A reading; `model` and `effort` (who read it) are there from the server, and may be missing in older fixtures. */
export type MenuReading = Omit<FullReading, "model" | "effort"> & Partial<Pick<FullReading, "model" | "effort">>;

/** The photo at most 2048 px on its longest side, as JPEG; fails with a Swedish text when it cannot be decoded. */
export function prepareMenuPhoto(file: Blob): Promise<Result<Blob>> {
  return downscaleImage(file, { maxSide: maxPlacePhotoSide });
}

/** The longest sides a page is tried at when the pages together are too heavy, largest first. */
const fitSides = [maxPlacePhotoSide, 1792, 1600] as const;

/**
 * The prepared pages, fitted to one request: as they are when together they weigh at most `budget`
 * (menuPhotosBudgetBytes, under the route's 4 MiB); else every page heavier than its share (budget / pages) is made
 * again from its prepared photo at a lower JPEG quality and, if that is not enough, a smaller side, until it fits its
 * share. Pages already under their share are left as they are. Fails (`image_too_large`) only when a page cannot be
 * made small enough; nothing is sent then.
 */
export async function fitMenuPhotos(photos: readonly Blob[], budget: number = menuPhotosBudgetBytes): Promise<Result<Blob[]>> {
  const total = photos.reduce((sum, photo) => sum + photo.size, 0);
  if (total <= budget) return ok([...photos]);
  const share = Math.floor(budget / Math.max(1, photos.length));
  const fitted: Blob[] = [];
  for (const photo of photos) {
    if (photo.size <= share) {
      fitted.push(photo);
      continue;
    }
    let smaller: Blob | null = null;
    for (const maxSide of fitSides) {
      const made = await downscaleImage(photo, { maxSide, quality: 0.75, maxBytes: share });
      if (made.ok) {
        smaller = made.data;
        break;
      }
      if (made.error.code !== "image_too_large") return made;
    }
    if (!smaller) return fail("image_too_large");
    fitted.push(smaller);
  }
  return ok(fitted);
}

/** The form for the route: every page as a field `image`, in order, and the quality. */
function menuForm(photos: readonly Blob[], quality: "standard" | "careful"): FormData {
  const body = new FormData();
  photos.forEach((photo, index) => body.append("image", photo, `menu-${index + 1}.jpg`));
  body.set("quality", quality);
  return body;
}

/** Reads the prepared pages (one menu); `careful` asks for the slower, more thorough reading. */
export function readMenuPhoto(photos: readonly Blob[], quality: "standard" | "careful", signal: AbortSignal): Promise<AiCallResult<MenuReading>> {
  return postAiForm<MenuReading>("/api/menu/read", menuForm(photos, quality), signal);
}

/**
 * The live reading: POST /api/menu/read?stream=1. `onEvent` gets each line as it arrives (`reading`, `language`, one
 * `dish` at a time, see MenuStreamEvent); the result is the final `done` reading, or the same failure as readMenuPhoto
 * (a failure before the first line is plain JSON with a status; one after it is an `error` line). Aborting `signal`
 * gives `{ aborted: true }`.
 */
export async function readMenuPhotoLive(
  photos: readonly Blob[],
  quality: "standard" | "careful",
  signal: AbortSignal,
  onEvent: (event: MenuStreamEvent) => void,
): Promise<AiCallResult<MenuReading>> {
  const body = menuForm(photos, quality);
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
