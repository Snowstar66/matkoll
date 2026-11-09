import type { AiCallResult } from "@/lib/ai-client";
import { type MenuReading, readMenuPhoto, readMenuPhotoLive } from "../actions/read-menu";
import type { MenuStreamEvent } from "../domain/reading";

/**
 * Reads the menu live (dishes arrive one by one), and falls back to the plain JSON route when the stream could not
 * be used: it failed before a single line came (a network, proxy or browser that cannot stream). A reading that
 * started and then failed, a stop by the person and every other failure are answered as they are, so a failing
 * reading is never paid for twice. A stream that is buffered along the way still ends in the final `done` line.
 */
export async function readMenuWithFallback(
  photo: Blob,
  quality: "standard" | "careful",
  signal: AbortSignal,
  onEvent: (event: MenuStreamEvent) => void,
): Promise<AiCallResult<MenuReading>> {
  let started = false;
  const live = await readMenuPhotoLive(photo, quality, signal, (event) => {
    started = true;
    onEvent(event);
  });
  if (live.ok || started) return live;
  if ("aborted" in live || signal.aborted) return live;
  if (live.error?.code !== "ai_unavailable") return live;
  return readMenuPhoto(photo, quality, signal);
}
