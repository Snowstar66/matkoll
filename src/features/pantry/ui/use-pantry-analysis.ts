"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { Location } from "@/features/catalog";
import { postAiForm, type AiCallResult } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, type AppError, type Result } from "@/lib/errors";
import {
  analyzeResultSchema,
  analyzeRetryCodes,
  type AnalyzeResult,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";

// The state of "Fotografera kylen" (FR-24, AD-2, AD-15, AD-18), held by
// PantrySuggestionsProvider above Hemma's keyed <Suspense>, so the
// suggestions stay while the location cards change, as long as Hemma is
// open. They live only here: never on the server, in localStorage,
// sessionStorage or the address, until Pontus confirms them (Story 6.2,
// PantrySuggestionsProvider), which takes them out one by one. The
// resized photo is kept in memory only while an error that "Försök igen" can
// help with is shown. The AI is only asked when Pontus has taken or chosen a
// photo.

/** A resized photo and the place it shows. */
type KeptPhoto = { image: Blob; location: Location };

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
  /** A photo from the camera or the file picker: resized, then analysed for `location`. */
  analyze: (file: Blob, location: Location) => void;
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
};

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
  const [arrivals, setArrivals] = useState(0);
  const [cancels, setCancels] = useState(0);
  const [settles, setSettles] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  /** The analysis on its way; `null` once it has answered, been stopped or Hemma has gone away. */
  const request = useRef<AbortController | null>(null);
  const cameraAreaRef = useRef<HTMLDivElement | null>(null);
  const cameraButtonRef = useRef<HTMLButtonElement | null>(null);

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
      setAnalyzing(false);
      generation.current += 1;
      latest.current = null;
      setResultState(null);
      setResultGeneration(generation.current);
      setError(null);
      setEmpty(null);
      setPhoto(null);
      setAnnouncement("");
    },
    [],
  );

  /** Starts a new analysis, stopping the one before: a new photo wins. */
  function start(): AbortController {
    request.current?.abort();
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
  }

  async function send(controller: AbortController, kept: KeptPhoto) {
    const form = new FormData();
    form.append("image", kept.image, "photo");
    form.append("location", kept.location);
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
      return;
    }

    if (answer.ok) {
      const parsed = analyzeResultSchema.safeParse(answer.data);
      if (!parsed.success) {
        failWith(fail("ai_invalid").error, kept);
        return;
      }
      // New suggestions replace the old ones only now that they are here. The photo is not needed any more.
      setResult(parsed.data);
      setPhoto(null);
      const groups = groupSuggestions(parsed.data);
      if (groups.added.length + groups.changed.length + groups.missing.length > 0) {
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
    // An expired session: the page sends Pontus to sign in.
    if (answer.error.code === "unauthorized") router.refresh();
    failWith(answer.error, kept);
  }

  /** Resizes the photo (AD-15) and sends it. A photo that cannot be read or made small enough is never sent. */
  async function analyze(file: Blob, location: Location) {
    const controller = start();
    let prepared: Result<Blob>;
    try {
      prepared = await downscaleImage(file);
    } catch {
      prepared = fail("image_unsupported");
    }
    if (!isCurrent(controller)) return;
    if (!prepared.ok) {
      finish(controller);
      failWith(prepared.error, null);
      return;
    }
    await send(controller, { image: prepared.data, location });
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
  }

  return {
    result,
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
    analyze: (file, location) => void analyze(file, location),
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
  };
}
