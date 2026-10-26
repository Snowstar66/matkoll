"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { Location } from "@/features/catalog";
import { postAiForm, type AiCallResult } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, type AppError, type Result } from "@/lib/errors";
import { imageSizeOf, maxPlacePhotoSide, type ImageSize } from "@/lib/images";
import {
  analyzeResultSchema,
  analyzeRetryCodes,
  type AnalyzeResult,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { hasNumberableCards, locateResultSchema, pointsByNumber, type PhotoNumbers } from "../domain/photo-numbers";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";

// The state of "Fotografera kylen" (FR-24, AD-2, AD-15, AD-18), held by
// PantrySuggestionsProvider above Hemma's keyed <Suspense>, so the
// suggestions stay while the location cards change, as long as Hemma is
// open. They live only here: never on the server, in localStorage,
// sessionStorage or the address, until Pontus confirms them (Story 6.2,
// PantrySuggestionsProvider), which takes them out one by one. The
// resized photo is kept for "Försök igen" only while an error it can help
// with is shown. The AI is only asked when Pontus has taken or chosen a
// photo.
//
// Places (Story 8.4, FR-33, AD-24): a photo is bound to the place Hemma shows
// when it is taken. Its id goes with the photo to /api/ai/analyze, and the
// answer has the place (`result.site`), which every write from the
// suggestions sends. The suggestions stay, with the same generation, when
// Hemma switches place, as when another location card is chosen.
//
// The photo during review (quick fix after Story 6.5): the resized photo
// that was sent for an answer with cards is kept as an object URL
// (reviewPhoto), so Pontus can check the reading against it. It stays in this
// browser's memory only (AD-15 forbids storing it, not holding it): never in
// localStorage or IndexedDB. It lives as long as the answer: when every card
// is handled it is only hidden, so "Ångra" brings the cards back with it. Its
// URL is revoked once a new answer has replaced it (after React has committed
// the new one, so no <img> shows a revoked URL) and when Hemma is left, both
// by the effect keyed on it.
//
// Nummer på fotot (Story 6.6): once the cards are shown, the same resized
// photo is sent once more, with the answer's `reading`, to /api/ai/locate in
// the background, and the points that come back are the photo's numbers
// (ReviewPhoto.numbers), which the cards and the large photo show. The cards
// never wait for them. A new photo and leaving Hemma stop the lookup; a
// lookup that fails or is stopped leaves the photo without numbers, and
// nothing is shown for it.

/**
 * A resized photo, the location it shows, the place (pantry_site) Hemma
 * showed when it was taken (Story 8.4, so "Försök igen" is for the same
 * place) and its size in pixels when it can be read from the file.
 */
type KeptPhoto = { image: Blob; location: Location; siteId: string; size: ImageSize | null };

/**
 * The photo an answer was read from, as an object URL, with its size in
 * pixels when known, and its numbers (Story 6.6): being looked up, none, or
 * the points by item number.
 */
export type ReviewPhoto = { url: string; size: ImageSize | null; numbers: PhotoNumbers };

const noNumbers: PhotoNumbers = { kind: "none" };

/** A lookup of the numbers (Story 6.6): the photo as it was sent for the analysis, its reading and its URL. */
type Lookup = { kept: KeptPhoto; labels: readonly string[]; url: string };

/**
 * Why an analysis gave no cards: the photo showed no food, its items could
 * not be read, or (Story 6.4) everything matches the place and nothing is
 * missing, with a complete comparison (`unchanged`) or with items that could
 * not be read (`partlyUnchanged`).
 */
export type EmptyAnswer = "none" | "unreadable" | "unchanged" | "partlyUnchanged";

export type PantryAnalysis = {
  /** The latest suggestions and the place they are from, or `null` before any. */
  result: AnalyzeResult | null;
  /**
   * The resized photo `result` was read from, when that answer had cards;
   * `null` otherwise. It stays when the cards are all handled (Hemma hides
   * it then), and goes with the next answer.
   */
  reviewPhoto: ReviewPhoto | null;
  /** A photo is being resized or analysed. */
  analyzing: boolean;
  /** Why the last photo failed; the suggestions from before stay. */
  error: AppError | null;
  /** The last answer had no suggestions, and why; `null` otherwise. */
  empty: EmptyAnswer | null;
  /** "Försök igen" can send the kept photo again for the current error. */
  canRetry: boolean;
  /** Increases when suggestions arrive, so the section can move focus to its heading. */
  arrivals: number;
  /** Increases when "Avbryt" stops an analysis, so the camera button can take focus back. */
  cancels: number;
  /** Increases when an analysis ends with an error or no suggestions, so the camera button can take focus back. */
  settles: number;
  /** Text for the camera's live region, when new suggestions came while focus was elsewhere. */
  announcement: string;
  /** Says `text` through the camera's live region instead of moving focus. */
  announce: (text: string) => void;
  /** The camera area: focus is only moved for an analysis while it is still there (or nowhere). */
  cameraAreaRef: RefObject<HTMLDivElement | null>;
  /** The camera button, for focus after "Avbryt" (and after the last suggestion is handled, Story 6.2). */
  cameraButtonRef: RefObject<HTMLButtonElement | null>;
  /**
   * A photo from the camera or the file picker: resized, then analysed for
   * `location` of the place `siteId`, the one Hemma shows as it is taken
   * (Story 8.4): the answer and every write from it stay with that place.
   */
  analyze: (file: Blob, location: Location, siteId: string) => void;
  /** "Försök igen": the kept photo again, for its own place. */
  retry: () => void;
  /** "Avbryt": stops the analysis; nothing is shown for it, and the suggestions from before stay. */
  cancel: () => void;
  /**
   * Which suggestions `result` holds: changes when an answer replaces them
   * and when Hemma is left, never when one is taken out or put back. A change
   * that waited (a save, "Ångra") applies only while it is the same.
   */
  generation: () => number;
  /** `generation()` as of this render. */
  resultGeneration: number;
  /** The suggestions as they are now (not as last rendered), or `null` when `generation` is no longer the one given. */
  latestSuggestions: (generation: number) => readonly PantrySuggestion[] | null;
  /** The suggestions with their comparison as they are now, or `null` when `generation` is no longer the one given. */
  latestResult: (generation: number) => AnalyzeResult | null;
  /** Changes the suggestions, unless `generation` is no longer the one given; returns whether it did. */
  editSuggestions: (generation: number, edit: (suggestions: PantrySuggestion[]) => PantrySuggestion[]) => boolean;
  /** Changes the "Syns inte längre" items of a compared photo (Story 6.4), like editSuggestions. */
  editMissing: (generation: number, edit: (missing: MissingItem[]) => MissingItem[]) => boolean;
  /** Changes the whole answer (suggestions and comparison), like editSuggestions. */
  editResult: (generation: number, edit: (result: AnalyzeResult) => AnalyzeResult) => boolean;
  /** Story 6.6: the photo at this URL cannot be shown, so its numbers go (`none`) and are not looked up again. */
  dropPhotoNumbers: (url: string) => void;
};

/** The size of the resized photo from its header (a JPEG from the canvas, or a stripped PNG: no EXIF turn), or `null`. */
async function photoSizeOf(image: Blob): Promise<ImageSize | null> {
  try {
    return imageSizeOf(new Uint8Array(await image.slice(0, 128 * 1024).arrayBuffer()));
  } catch {
    return null;
  }
}

/** Focus is still in the camera area, or on nothing: an answer may take it. Elsewhere (a sheet, the list), it stays. */
export function focusIsFree(area: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || (area !== null && area.contains(active));
}

export function usePantryAnalysis(): PantryAnalysis {
  const router = useRouter();
  const [result, setResultState] = useState<AnalyzeResult | null>(null);
  /** `result` as it is now, for changes that waited; every change goes through setResult. */
  const latest = useRef<AnalyzeResult | null>(null);
  const generation = useRef(0);
  const [resultGeneration, setResultGeneration] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [empty, setEmpty] = useState<EmptyAnswer | null>(null);
  const [photo, setPhoto] = useState<KeptPhoto | null>(null);
  const [reviewPhoto, setReviewPhotoState] = useState<ReviewPhoto | null>(null);
  const [arrivals, setArrivals] = useState(0);
  const [cancels, setCancels] = useState(0);
  const [settles, setSettles] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  /** The analysis on its way; `null` once it has answered, been stopped or Hemma has gone away. */
  const request = useRef<AbortController | null>(null);
  const cameraAreaRef = useRef<HTMLDivElement | null>(null);
  const cameraButtonRef = useRef<HTMLButtonElement | null>(null);
  /** The lookup of the numbers on the photo on its way (Story 6.6); `null` once it has answered or been stopped. */
  const locateRequest = useRef<AbortController | null>(null);
  /** The latest lookup for the photo shown: what to send again if it was stopped while its cards stay. */
  const lookup = useRef<Lookup | null>(null);
  /** A lookup stopped while its cards stayed (a new photo on its way, every card handled): sent again when they are back. */
  const resume = useRef<Lookup | null>(null);

  /**
   * The photo of a new answer, or none: the one before is revoked by the
   * effect below once this is committed, and a lookup for it is stopped.
   * Its numbers start as `numbers`. Returns its URL, or `null` when there is
   * no photo to show.
   */
  function setReviewPhoto(kept: KeptPhoto | null, numbers: PhotoNumbers = noNumbers): string | null {
    stopLocating();
    lookup.current = null;
    resume.current = null;
    // A browser without object URLs shows the suggestions without the photo.
    const url = kept && typeof URL.createObjectURL === "function" ? URL.createObjectURL(kept.image) : null;
    setReviewPhotoState(url ? { url, size: kept?.size ?? null, numbers } : null);
    return url;
  }

  /** Sets the numbers of the photo at `url`, unless another photo has taken its place. */
  function setNumbers(url: string, numbers: PhotoNumbers) {
    setReviewPhotoState((current) => (current && current.url === url ? { ...current, numbers } : current));
  }

  /** Stops the lookup on its way, if any, and says whether there was one; a photo still waiting for it gets no numbers. */
  function stopLocating(): boolean {
    const controller = locateRequest.current;
    if (!controller) return false;
    controller.abort();
    locateRequest.current = null;
    setReviewPhotoState((current) => (current?.numbers.kind === "pending" ? { ...current, numbers: noNumbers } : current));
    return true;
  }

  /** Sends a lookup that was stopped while its cards stayed again, now that they are shown without a newer photo on its way. */
  function resumeLocating() {
    const job = resume.current;
    resume.current = null;
    if (!job || request.current) return;
    void locate(job);
  }

  /**
   * Story 6.6: the same photo and the answer's reading to /api/ai/locate, in
   * the background, stopping a lookup still on its way. The points become
   * the numbers of the photo at `job.url`; a placeholder item's point is
   * never used. Any failure (the model, the time, a newer run, an answer the
   * schema refuses) leaves it without numbers; nothing is shown for it.
   */
  async function locate(job: Lookup) {
    locateRequest.current?.abort();
    const controller = new AbortController();
    locateRequest.current = controller;
    lookup.current = job;
    setNumbers(job.url, { kind: "pending" });
    const form = new FormData();
    form.append("image", job.kept.image, "photo");
    form.append("labels", JSON.stringify(job.labels));
    let answer: AiCallResult<unknown>;
    try {
      answer = await postAiForm<unknown>("/api/ai/locate", form, controller.signal);
    } catch {
      answer = fail("ai_unavailable");
    }
    // Stopped by a new photo, a newer lookup or leaving Hemma: the one that stopped it has set the numbers.
    if (locateRequest.current !== controller || controller.signal.aborted) return;
    locateRequest.current = null;
    const parsed = answer.ok ? locateResultSchema.safeParse(answer.data) : null;
    setNumbers(job.url, parsed?.success ? { kind: "ready", points: pointsByNumber(parsed.data, job.labels) } : noNumbers);
  }

  /** The photo at `url` cannot be shown (Story 6.6): its numbers go, and are not looked up again. */
  function dropPhotoNumbers(url: string) {
    if (lookup.current?.url === url) {
      locateRequest.current?.abort();
      locateRequest.current = null;
      lookup.current = null;
      resume.current = null;
    }
    setNumbers(url, noNumbers);
  }

  // Each URL is revoked exactly once: after the commit that replaced it, or when Hemma is left.
  const reviewUrl = reviewPhoto?.url ?? null;
  useEffect(() => {
    if (!reviewUrl) return;
    return () => URL.revokeObjectURL(reviewUrl);
  }, [reviewUrl]);

  /** New suggestions (or none): a new generation. */
  function setResult(next: AnalyzeResult | null) {
    generation.current += 1;
    latest.current = next;
    setResultState(next);
    setResultGeneration(generation.current);
  }

  function editResult(expected: number, edit: (result: AnalyzeResult) => AnalyzeResult): boolean {
    const current = latest.current;
    if (generation.current !== expected || !current) return false;
    const next = edit(current);
    latest.current = next;
    setResultState(next);
    // Story 6.6: with no card left to number (all handled), the lookup stops; "Ångra" that brings one back sends it again.
    if (hasNumberableCards(groupSuggestions(next), next.reading ?? [])) resumeLocating();
    else if (stopLocating()) resume.current = lookup.current;
    return true;
  }

  const editSuggestions = (expected: number, edit: (suggestions: PantrySuggestion[]) => PantrySuggestion[]) =>
    editResult(expected, (current) => ({ ...current, suggestions: edit(current.suggestions) }));

  const editMissing = (expected: number, edit: (missing: MissingItem[]) => MissingItem[]) =>
    editResult(expected, (current) =>
      current.inventory.kind === "compared"
        ? { ...current, inventory: { ...current.inventory, missing: edit(current.inventory.missing) } }
        : current,
    );

  // Leaving Hemma, also when the page is only hidden after a navigation:
  // the analysis on its way is stopped, and the suggestions and the photo go.
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      locateRequest.current?.abort();
      locateRequest.current = null;
      lookup.current = null;
      resume.current = null;
      setAnalyzing(false);
      generation.current += 1;
      latest.current = null;
      setResultState(null);
      setResultGeneration(generation.current);
      setError(null);
      setEmpty(null);
      setPhoto(null);
      setReviewPhotoState(null);
      setAnnouncement("");
    },
    [],
  );

  /** Starts a new analysis, stopping the one before and the lookup of numbers: a new photo wins. */
  function start(): AbortController {
    request.current?.abort();
    // The old cards stay until the new answer is here: a lookup stopped now is sent again if none comes.
    if (stopLocating()) resume.current = lookup.current;
    const controller = new AbortController();
    request.current = controller;
    setAnalyzing(true);
    setError(null);
    setEmpty(null);
    setAnnouncement("");
    return controller;
  }

  /** The analysis is still the one wanted: not stopped, and not replaced by a newer one. */
  const isCurrent = (controller: AbortController) => request.current === controller && !controller.signal.aborted;

  function finish(controller: AbortController) {
    if (request.current === controller) request.current = null;
    setAnalyzing(false);
  }

  /** Shows the error; the photo is kept only when "Försök igen" can help. */
  function failWith(appError: AppError, kept: KeptPhoto | null) {
    setError(appError);
    setPhoto(kept && analyzeRetryCodes.has(appError.code) ? kept : null);
    setSettles((count) => count + 1);
    resumeLocating();
  }

  async function send(controller: AbortController, kept: KeptPhoto) {
    const form = new FormData();
    form.append("image", kept.image, "photo");
    form.append("location", kept.location);
    form.append("site", kept.siteId);
    let answer: AiCallResult<unknown>;
    try {
      answer = await postAiForm<unknown>("/api/ai/analyze", form, controller.signal);
    } catch {
      answer = controller.signal.aborted ? { ok: false, aborted: true } : fail("ai_unavailable");
    }
    // Stopped ("Avbryt", Hemma gone), or replaced by a newer photo, which owns the state.
    if (!isCurrent(controller)) return;
    finish(controller);
    // A newer analysis of the same person (another tab) took over: like Avbryt, nothing is shown.
    if (!answer.ok && ("aborted" in answer || answer.error.code === "ai_superseded")) {
      setPhoto(null);
      resumeLocating();
      return;
    }

    if (answer.ok) {
      const parsed = analyzeResultSchema.safeParse(answer.data);
      if (!parsed.success) {
        failWith(fail("ai_invalid").error, kept);
        return;
      }
      // New suggestions replace the old ones only now that they are here. The photo is no longer kept
      // for "Försök igen"; it is shown with the cards while they are reviewed, and not without them.
      setResult(parsed.data);
      setPhoto(null);
      const groups = groupSuggestions(parsed.data);
      const hasCards = groups.added.length + groups.changed.length + groups.missing.length > 0;
      // Story 6.6: numbers only for the cards shown that come from the reading, and only for a photo whose size is
      // known, since the markers are placed on it.
      const reading = parsed.data.reading ?? [];
      const numbered = hasNumberableCards(groups, reading) && kept.size !== null;
      const url = setReviewPhoto(hasCards ? kept : null);
      // The cards first: the lookup starts only now that they are on their way to the screen.
      if (url && numbered) void locate({ kept, labels: reading, url });
      if (hasCards) {
        // Cards to show, also "Syns inte längre" alone for a photo without usable items of a place with items (Story 6.4).
        setArrivals((count) => count + 1);
      } else if (parsed.data.suggestions.length === 0) {
        setEmpty(parsed.data.dropped > 0 ? "unreadable" : "none");
        setSettles((count) => count + 1);
      } else {
        // Everything matches the place (Story 6.4): no card, the camera area says so.
        setEmpty(groups.incomplete || parsed.data.dropped > 0 ? "partlyUnchanged" : "unchanged");
        setSettles((count) => count + 1);
      }
      return;
    }
    // An expired session: the page sends Pontus to sign in. A place that is
    // gone (Story 8.4): the page is read again, so Hemma shows one that is there.
    if (answer.error.code === "unauthorized" || answer.error.code === "pantry_site_gone") router.refresh();
    failWith(answer.error, kept);
  }

  /** Resizes the photo (AD-15) and sends it. A photo that cannot be read or made small enough is never sent. */
  async function analyze(file: Blob, location: Location, siteId: string) {
    const controller = start();
    let prepared: Result<Blob>;
    try {
      prepared = await downscaleImage(file, { maxSide: maxPlacePhotoSide });
    } catch {
      prepared = fail("image_unsupported");
    }
    if (!isCurrent(controller)) return;
    if (!prepared.ok) {
      finish(controller);
      failWith(prepared.error, null);
      return;
    }
    const size = await photoSizeOf(prepared.data);
    if (!isCurrent(controller)) return;
    await send(controller, { image: prepared.data, location, siteId, size });
  }

  function retry() {
    if (!photo || request.current) return;
    void send(start(), photo);
  }

  function cancel() {
    if (!request.current) return;
    request.current.abort();
    request.current = null;
    setAnalyzing(false);
    setPhoto(null);
    setCancels((count) => count + 1);
    resumeLocating();
  }

  return {
    result,
    reviewPhoto,
    analyzing,
    error,
    empty,
    canRetry: photo !== null && error !== null && analyzeRetryCodes.has(error.code),
    arrivals,
    cancels,
    settles,
    announcement,
    announce: setAnnouncement,
    cameraAreaRef,
    cameraButtonRef,
    analyze: (file, location, siteId) => void analyze(file, location, siteId),
    retry,
    cancel,
    generation: () => generation.current,
    resultGeneration,
    latestSuggestions: (expected) =>
      generation.current === expected && latest.current ? latest.current.suggestions : null,
    latestResult: (expected) => (generation.current === expected ? latest.current : null),
    editSuggestions,
    editMissing,
    editResult,
    dropPhotoNumbers,
  };
}
