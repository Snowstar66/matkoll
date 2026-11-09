import { type AiCallResult, postAiForm } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import type { Result } from "@/lib/errors";
import { maxPlacePhotoSide } from "@/lib/images";
import type { Menu } from "../domain/types";

// The menu photo's way to POST /api/menu/read (AD-9): not a Server Action, since AI is only called from route handlers.
// The photo is made small in the browser first (2048 px on the longest side, as the route allows) and is only held in memory.

export type MenuReading = { menu: Menu; quality: "standard" | "careful"; escalated: boolean };

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
