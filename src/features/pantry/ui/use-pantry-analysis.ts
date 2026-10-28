"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { waitingText } from "@/features/ai-jobs";
import type { Location } from "@/features/catalog";
import { isActive, type AiJob } from "@/lib/ai-job-shape";
import { useAiJobs, useShowingAiResults } from "@/lib/ai-jobs-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, isErrorCode, type AppError, type Result } from "@/lib/errors";
import { imageSizeOf, maxPlacePhotoSide, type ImageSize } from "@/lib/images";
import { analyzeRetryCodes, type AnalyzeResult, type PantrySuggestion } from "../domain/pantry-suggestion";
import { photoJobResultSchema, type PhotoPoints } from "../domain/photo-job";
import { hasNumberableCards, pointsByNumber, type PhotoNumbers } from "../domain/photo-numbers";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";
import type { PhotoSite } from "../domain/site";
import { keepPhoto, keptPhoto, releasePhoto, type KeptPhoto } from "./photo-store";
import { photoSave, type PhotoSave } from "./place-photo-save";

// The state of "Fotografera kylen" (FR-24, FR-46-FR-49, AD-2, AD-15, AD-18,
// AD-28), held by PantrySuggestionsProvider above Hemma's keyed <Suspense>, so
// the suggestions stay while the location cards change, as long as Hemma is
// open. A photo is an AI job (Story 12.5): it is posted to
// /api/ai/jobs/photo and the page goes on, so Pontus can photograph another
// place while the first is read. The jobs and their queue are the app's
// (src/lib/ai-jobs-client.ts); this hook starts one, shows per place that it
// is being read or waits, and shows a result when it is there: the cards when
// the reading is, and the numbers on the photo when they come after. The
// result is fetched with its comparison against the place as it is when it is
// opened. Pontus sees one result at a time: one that comes while another is
// still being reviewed waits (the place's card says "Förslag klara") until
// the one before is handled, unless it is for the same place, which it
// replaces, or Pontus took its photo after the cards came (a new photo wins). The suggestions live only here and in the job's result, never in
// localStorage, sessionStorage or the address, until Pontus confirms them
// (Story 6.2), which takes them out one by one.
//
// The photo is only in this tab's memory (photo-store.ts): per job, until its
// result is closed or 30 minutes have passed (AD-15 forbids storing it, not
// holding it). After a reload there is none: the cards work all the same, but
// there is no photo to compare with, and no latest photo is saved (AD-26).
// While the cards are reviewed the photo is an object URL (reviewPhoto), which
// is revoked once a new result has replaced it (after React has committed the
// new one, so no <img> shows a revoked URL) and when Hemma is left.
//
// Places (Story 8.4, FR-33, AD-24): a photo is bound to the place Hemma shows
// when it is taken. Its id goes with the photo, and the result has the place
// (`result.site`), which every write from the suggestions sends. A result for
// another place than the one sent is `ai_invalid`. The suggestions stay, with
// the same generation, when Hemma switches place, as when another location card
// is chosen. When a write finds the place gone, they go (dropForGoneSite).
//
// Nummer på fotot (Story 6.6): the numbers are the second step of the same job.
// While the job runs after its reading, the photo's numbers are `pending`; the
// result fetched once the job has ended has them (`ready`) or none. A result
// that is closed (every card handled) closes the job, which stops the numbers
// if they are still being looked up.
//
// Senaste foto (Story 10.1, FR-37, AD-26): a result with cards for a place and
// a photo in memory gets a PhotoSave (photoSaver), which the first write from
// its suggestions that succeeds uses to save the photo as the latest of its
// place and location: the photo as analysed, the place and location of the
// result, the time it was taken, the reading and the points, when they have
// come. The save is never stopped once started, and nothing is shown for it.

/**
 * The photo an answer was read from, as an object URL, with its size in
 * pixels when known, and its numbers (Story 6.6): being looked up, none, or
 * the points by item number.
 */
export type ReviewPhoto = { url: string; size: ImageSize | null; numbers: PhotoNumbers };

const noNumbers: PhotoNumbers = { kind: "none" };

/**
 * Why an analysis gave no cards: the photo showed no food, its items could
 * not be read, or (Story 6.4) everything matches the place and nothing is
 * missing, with a complete comparison (`unchanged`) or with items that could
 * not be read (`partlyUnchanged`).
 */
export type EmptyAnswer = "none" | "unreadable" | "unchanged" | "partlyUnchanged";

/** What the camera area says about a place whose photo is being read: that it waits behind others, or nothing more. */
export type Looking = { waiting: string | null };

/** The result shown now: its job, and what is kept for it. */
type ShownJob = {
  jobId: string;
  kept: KeptPhoto | null;
  url: string | null;
  labels: readonly string[];
  save: PhotoSave | null;
  /** The numbers are still being looked up: the job runs after its reading. */
  numbersPending: boolean;
};

export type PantryAnalysis = {
  /** The latest suggestions and the place they are from, or `null` before any. */
  result: AnalyzeResult | null;
  /**
   * The resized photo `result` was read from, when that answer had cards and
   * the photo is still in memory; `null` otherwise. It stays when the cards
   * are all handled (Hemma hides it then), and goes with the next answer.
   */
  reviewPhoto: ReviewPhoto | null;
  /** The cards came without a photo to show with them (after a reload, or after 30 minutes): "Fotot finns inte kvar efter omladdningen." */
  photoGone: boolean;
  /** Whether the photo of `location` of the place `siteId` is being resized, sent, read or waits in the queue; `null` when it is not. */
  looking: (siteId: string, location: Location) => Looking | null;
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
   * A photo from the camera or the file picker: resized, then read as a job
   * for `location` of the place `site`, the one Hemma shows as it is taken
   * (Story 8.4): the answer and every write from it stay with that place.
   */
  analyze: (file: Blob, location: Location, site: PhotoSite) => void;
  /**
   * Story 8.4: drops the suggestions of `generation`, whose place is gone,
   * and says so in the camera area; returns whether they were still there.
   */
  dropForGoneSite: (generation: number) => boolean;
  /** "Försök igen": the kept photo again, for its own place. */
  retry: () => void;
  /** "Avbryt": stops the photo of `location` of the place `siteId`; nothing is shown for it, and the suggestions from before stay. */
  cancel: (siteId: string, location: Location) => void;
  /**
   * Story 12.5: the locations of the place `siteId` with suggestions that
   * have come and are not closed (shown now, or waiting): "Förslag klara" on
   * their cards.
   */
  readyLocations: (siteId: string) => Location[];
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
  /** Story 6.6: the photo at this URL cannot be shown, so its numbers go (`none`). */
  dropPhotoNumbers: (url: string) => void;
  /**
   * Story 10.1: the save of the photo behind the suggestions of `generation`,
   * while they are the current ones, or `null` (no photo, no place, or newer
   * suggestions). A write takes it before it starts and calls `written` once
   * it has succeeded, also when newer suggestions came meanwhile.
   */
  photoSaver: (generation: number) => PhotoSave | null;
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

const placeKey = (siteId: string | null, location: Location) => `${siteId ?? ""}|${location}`;

/** The place a photo's job is for, from its context (the place's id and the location). */
function jobPlace(job: AiJob): { siteId: string | null; location: string | null } {
  const { siteId, location } = job.context;
  return {
    siteId: typeof siteId === "string" ? siteId : null,
    location: typeof location === "string" ? location : null,
  };
}

/** The result still has cards to review: "Nytt", "Ändrat" or "Syns inte längre". */
function hasOpenCards(result: AnalyzeResult): boolean {
  const groups = groupSuggestions(result);
  return groups.added.length + groups.changed.length + groups.missing.length > 0;
}

/** The numbers of a result's `points`: the points by item number, or none. */
function numbersOf(points: PhotoPoints | undefined, labels: readonly string[]): PhotoNumbers {
  if (points === null || points === undefined || typeof points === "string") return noNumbers;
  return { kind: "ready", points: pointsByNumber(points, labels) };
}

export function usePantryAnalysis(): PantryAnalysis {
  const router = useRouter();
  const { jobs, loaded, start, cancel: cancelJob, markSeen, dismiss, fetchResult } = useAiJobs();
  const [result, setResultState] = useState<AnalyzeResult | null>(null);
  /** `result` as it is now, for changes that waited; every change goes through setResult. */
  const latest = useRef<AnalyzeResult | null>(null);
  const generation = useRef(0);
  const [resultGeneration, setResultGeneration] = useState(0);
  /** The places whose photo is being resized or sent, by placeKey, with the number of the start that owns it. */
  const [startings, setStartings] = useState<ReadonlyMap<string, number>>(new Map());
  const startCount = useRef(0);
  const [error, setError] = useState<AppError | null>(null);
  const [empty, setEmpty] = useState<EmptyAnswer | null>(null);
  /** The photo of a job that failed in a way "Försök igen" can help with. */
  const [photo, setPhoto] = useState<KeptPhoto | null>(null);
  const [reviewPhoto, setReviewPhotoState] = useState<ReviewPhoto | null>(null);
  const [photoGone, setPhotoGone] = useState(false);
  const [arrivals, setArrivals] = useState(0);
  const [cancels, setCancels] = useState(0);
  const [settles, setSettles] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const cameraAreaRef = useRef<HTMLDivElement | null>(null);
  const cameraButtonRef = useRef<HTMLButtonElement | null>(null);
  /** The job whose result is shown now, and what is kept for it. */
  const shown = useRef<ShownJob | null>(null);
  /** The jobs whose result or failure has been taken up here, so none is shown twice. */
  const handled = useRef(new Set<string>());
  /** Counts the jobs taken up, so what waits (readyLocations) is read again. */
  const [, setHandledCount] = useState(0);
  /** A result is being fetched, so no second one is taken up at the same time. */
  const presenting = useRef(false);
  /** The numbers are being fetched for the job shown. */
  const fetchingNumbers = useRef(false);
  /** When each job was started here (Date.now()), and when the result shown was taken up: a photo taken after the cards came is the newer wish. */
  const startedAt = useRef(new Map<string, number>());
  const shownAt = useRef(0);
  /** The result and the job list changed: the effects that decide what to show run again. */
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);
  /** Story 10.1: the save of the current suggestions' photo, with their generation. */
  const currentSave = useRef<{ generation: number; save: PhotoSave } | null>(null);

  // The results are on the screen while Hemma is open: no confirmation says what is already here.
  useShowingAiResults("analyze");

  /**
   * The photo of a new answer, or none: the one before is revoked by the
   * effect below once this is committed. Its numbers start as `numbers`.
   * Returns its URL, or `null` when there is no photo to show.
   */
  function setReviewPhoto(kept: KeptPhoto | null, numbers: PhotoNumbers): string | null {
    // A browser without object URLs shows the suggestions without the photo.
    const url = kept && typeof URL.createObjectURL === "function" ? URL.createObjectURL(kept.image) : null;
    setReviewPhotoState(url ? { url, size: kept?.size ?? null, numbers } : null);
    return url;
  }

  /** Sets the numbers of the photo at `url`, unless another photo has taken its place. */
  function setNumbers(url: string, numbers: PhotoNumbers) {
    setReviewPhotoState((current) => (current && current.url === url ? { ...current, numbers } : current));
  }

  /** The job whose photo "Försök igen" sends again, so retry can let its photo go. */
  const photoJobId = useRef<string | null>(null);
  /** Places whose photo was cancelled while it was being sent: the job it gets is cancelled too, and is not shown as waiting meanwhile. */
  const cancelledStarts = useRef(new Set<string>());
  /** The photos being resized or sent, by place: the number of the start that owns the place (a newer start or "Avbryt" takes it over). */
  const startOwners = useRef(new Map<string, number>());
  function startOwner(key: string): number | undefined {
    return startOwners.current.get(key);
  }
  function beginStarting(key: string): number {
    const token = ++startCount.current;
    startOwners.current.set(key, token);
    setStartings(new Map(startOwners.current));
    return token;
  }
  function endStarting(key: string, token: number) {
    if (startOwners.current.get(key) !== token) return;
    startOwners.current.delete(key);
    setStartings(new Map(startOwners.current));
  }

  /**
   * The job of the result shown is closed (a running one is stopped) and its
   * photo let go; the cards stay where they are. A job closed before
   * (jobId "") needs nothing.
   */
  function closeShown() {
    const job = shown.current;
    if (!job) return;
    shown.current = null;
    if (job.jobId === "") return;
    releasePhoto(job.jobId);
    void dismiss(job.jobId);
  }

  /**
   * Story 8.4: a write from the suggestions of `expected` found their place
   * gone. They could never be saved, so they go with their photo, and the
   * camera area says why ("Stället finns inte längre. Välj ett annat
   * ställe.", as an alert). Returns whether they went.
   */
  function dropForGoneSite(expected: number): boolean {
    if (generation.current !== expected || !latest.current) return false;
    closeShown();
    setResult(null);
    setReviewPhotoState(null);
    setEmpty(null);
    setPhoto(null);
    setError(fail("pantry_site_gone").error);
    setSettles((count) => count + 1);
    return true;
  }

  /** The photo at `url` cannot be shown (Story 6.6): its numbers go. */
  function dropPhotoNumbers(url: string) {
    setNumbers(url, noNumbers);
  }

  // Each URL is revoked exactly once: after the commit that replaced it, or when Hemma is left.
  const reviewUrl = reviewPhoto?.url ?? null;
  useEffect(() => {
    if (!reviewUrl) return;
    return () => URL.revokeObjectURL(reviewUrl);
  }, [reviewUrl]);

  /** New suggestions (or none): a new generation, whose photo has no save until one is made for it. */
  function setResult(next: AnalyzeResult | null) {
    currentSave.current = null;
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
    // Every card handled: the result is closed, which closes its job and lets the photo go from memory.
    // "Ångra" brings the cards back from this state; the job is not needed for that.
    if (!hasOpenCards(next)) closeShown();
    setTick((count) => count + 1);
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

  // Leaving Hemma, also when the page is only hidden after a navigation: the
  // suggestions and the photo shown go. The jobs stay: what is queued, running
  // or not yet shown comes back when Hemma is opened again, and the photos stay
  // in memory (photo-store.ts) for the jobs that are not closed.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A save that has started goes on (Story 10.1); no new one starts from here.
      currentSave.current = null;
      shown.current = null;
      generation.current += 1;
      latest.current = null;
      setResultState(null);
      setResultGeneration(generation.current);
      setError(null);
      setEmpty(null);
      setPhoto(null);
      setPhotoGone(false);
      setReviewPhotoState(null);
      setAnnouncement("");
    };
  }, []);

  /** Shows the error; the photo is kept only when "Försök igen" can help. */
  function failWith(appError: AppError, kept: KeptPhoto | null) {
    setError(appError);
    setPhoto(kept && analyzeRetryCodes.has(appError.code) ? kept : null);
    setSettles((count) => count + 1);
  }

  /** Sends the photo as a job; the answer is the job in the list, whose result is taken up when it is there. */
  async function post(kept: KeptPhoto, token: number): Promise<boolean> {
    const key = placeKey(kept.site.id, kept.location);
    const form = new FormData();
    form.append("image", kept.image, "photo");
    form.append("kind", "analyze");
    form.append("location", kept.location);
    form.append("site", kept.site.id);
    form.append("takenAt", kept.takenAt.toISOString());
    // One key per photo: a retry after a network error would be a new photo, so a new key.
    const answer = await start("/api/ai/jobs/photo", form, crypto.randomUUID());
    const stillOwned = startOwner(key) === token;
    if (stillOwned) endStarting(key, token);
    if (!mounted.current && !answer.ok) return false;
    if (!answer.ok) {
      cancelledStarts.current.delete(key);
      if (!stillOwned) return false;
      // An expired session: the page sends Pontus to sign in. A place that is gone
      // (Story 8.4): the page is read again, so Hemma shows one that is there.
      if (answer.error.code === "unauthorized" || answer.error.code === "pantry_site_gone") router.refresh();
      failWith(answer.error, kept);
      return false;
    }
    const { job } = answer.data;
    // "Avbryt" came while the photo was on its way: the job is stopped now that it has an id.
    if (!stillOwned) {
      // Never shown, also not for the moment before the cancel reaches the list.
      handled.current.add(job.id);
      cancelledStarts.current.delete(key);
      void cancelJob(job.id);
      return false;
    }
    keepPhoto(job.id, kept);
    startedAt.current.set(job.id, Date.now());
    setTick((count) => count + 1);
    return true;
  }

  /** Resizes the photo (AD-15) and sends it. A photo that cannot be read or made small enough is never sent. */
  async function analyze(file: Blob, location: Location, site: PhotoSite) {
    // Story 10.1: the time Pontus recognises for the photo is when it was taken or chosen.
    const takenAt = new Date();
    const key = placeKey(site.id, location);
    const token = beginStarting(key);
    setError(null);
    setEmpty(null);
    setPhoto(null);
    setAnnouncement("");
    let prepared: Result<Blob>;
    try {
      prepared = await downscaleImage(file, { maxSide: maxPlacePhotoSide });
    } catch {
      prepared = fail("image_unsupported");
    }
    if (startOwner(key) !== token) return;
    if (!prepared.ok) {
      endStarting(key, token);
      failWith(prepared.error, null);
      return;
    }
    const size = await photoSizeOf(prepared.data);
    if (startOwner(key) !== token) return;
    await post({ image: prepared.data, location, site: { id: site.id, name: site.name }, size, takenAt }, token);
  }

  function retry() {
    if (!photo) return;
    const kept = photo;
    const token = beginStarting(placeKey(kept.site.id, kept.location));
    setError(null);
    setPhoto(null);
    // The old job's photo is let go once the new job is posted (the new job keeps its own copy).
    const old = photoJobId.current;
    photoJobId.current = null;
    void post(kept, token).then((posted) => {
      if (posted && old !== null) releasePhoto(old);
    });
  }

  /** The active photo job of a place that has not given its cards yet (or none). */
  function waitingJob(siteId: string, location: Location): AiJob | undefined {
    if (cancelledStarts.current.has(placeKey(siteId, location))) return undefined;
    return jobs.find((job) => {
      // A job taken up here is not waiting any more: it has its cards, or was cancelled while it was being sent.
      if (job.kind !== "analyze" || !isActive(job) || job.count !== null || handled.current.has(job.id)) return false;
      const place = jobPlace(job);
      return place.siteId === siteId && place.location === location;
    });
  }

  function cancel(siteId: string, location: Location) {
    const key = placeKey(siteId, location);
    // A photo that is still being resized or sent: its start is let go, and its job (if it gets one) is cancelled.
    if (startOwners.current.delete(key)) {
      cancelledStarts.current.add(key);
      setStartings(new Map(startOwners.current));
    }
    const job = waitingJob(siteId, location);
    if (job) {
      releasePhoto(job.id);
      void cancelJob(job.id);
    }
    setPhoto(null);
    setCancels((count) => count + 1);
  }

  /** Takes up a job's failure or its reading: shows it, counts it as seen and closes what has no use. */
  async function present(job: AiJob) {
    if (job.status === "failed") {
      const code = job.errorCode !== null && isErrorCode(job.errorCode) ? job.errorCode : "ai_unavailable";
      failWith(fail(code).error, keptPhoto(job.id));
      photoJobId.current = job.id;
      // A job lost is not retried from memory: its photo goes at once.
      if (code === "ai_job_lost") releasePhoto(job.id);
      if (code === "pantry_site_gone" || code === "unauthorized") router.refresh();
      // The failure is shown here, so the job has done its part; the photo is kept for "Försök igen".
      void dismiss(job.id);
      return;
    }
    const fetched = await fetchResult(job.id);
    if (!mounted.current) {
      handled.current.delete(job.id);
      return;
    }
    if (!fetched.ok) {
      // A result that is gone (closed on another device, older than 24 hours) is said so; any other failure
      // (the network) is tried again with the next read of the jobs.
      if (fetched.error.code === "ai_job_gone") void markSeen(job.id);
      else handled.current.delete(job.id);
      if (fetched.error.code === "ai_job_gone") setError(fetched.error);
      return;
    }
    const parsed = photoJobResultSchema.safeParse(fetched.data.result);
    const kept = keptPhoto(job.id);
    // Story 8.4: a result for another place than the one sent is not this photo's.
    if (!parsed.success || (parsed.data.site !== null && kept !== null && parsed.data.site.id !== kept.site.id)) {
      failWith(fail("ai_invalid").error, kept);
      void dismiss(job.id);
      return;
    }
    const { points, ...answer } = parsed.data;
    const data: AnalyzeResult = answer;
    // New suggestions replace the old ones only now that they are here.
    closeShown();
    setResult(data);
    setPhoto(null);
    setError(null);
    const groups = groupSuggestions(data);
    const hasCards = groups.added.length + groups.changed.length + groups.missing.length > 0;
    // Story 6.6: numbers only for the cards shown that come from the reading, and only for a photo whose size is
    // known, since the markers are placed on it.
    const reading = data.reading ?? [];
    const numbered = hasNumberableCards(groups, reading) && kept?.size != null;
    const pending = numbered && points === null && job.status === "running";
    const initial: PhotoNumbers = pending ? { kind: "pending" } : numbered ? numbersOf(points, reading) : noNumbers;
    const url = setReviewPhoto(hasCards ? kept : null, initial);
    setPhotoGone(hasCards && kept === null);
    // Story 10.1: only a photo with cards can change the pantry, only one for a place is saved, and only one still here.
    const save =
      hasCards && kept !== null && data.site !== null
        ? photoSave({ image: kept.image, siteId: data.site.id, location: data.location, takenAt: kept.takenAt, reading })
        : null;
    if (save) {
      currentSave.current = { generation: generation.current, save };
      if (initial.kind === "ready") save.located([...initial.points.values()]);
    }
    shown.current = { jobId: job.id, kept, url, labels: reading, save, numbersPending: pending };
    shownAt.current = Date.now();
    void markSeen(job.id);
    if (hasCards) {
      // Cards to show, also "Syns inte längre" alone for a photo without usable items of a place with items (Story 6.4).
      setArrivals((count) => count + 1);
    } else {
      if (data.suggestions.length === 0) setEmpty(data.dropped > 0 ? "unreadable" : "none");
      // Everything matches the place (Story 6.4): no card, the camera area says so.
      else setEmpty(groups.incomplete || data.dropped > 0 ? "partlyUnchanged" : "unchanged");
      setSettles((count) => count + 1);
      // Nothing to review: the job and the photo have done their part.
      closeShown();
    }
  }

  // What the jobs hand over: a result whose reading is there (running with its cards, or done) or a failure.
  // One result at a time: while another is reviewed, a result for another place waits.
  useEffect(() => {
    if (!loaded || presenting.current) return;
    const candidates = jobs
      .filter((job) => job.kind === "analyze" && !handled.current.has(job.id))
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    const current = latest.current;
    const free = (job: AiJob) => {
      if (!current || !hasOpenCards(current)) return true;
      // The same place replaces its older result, and so does a photo that Pontus took after these cards came; a result
      // of a photo taken before them (a queue of places) waits until they are handled.
      if ((startedAt.current.get(job.id) ?? 0) > shownAt.current) return true;
      const place = jobPlace(job);
      return place.siteId === (current.site?.id ?? null) && place.location === current.location;
    };
    const next = candidates.find((job) => {
      if (job.status === "failed") return !job.seen;
      return (job.status === "running" || job.status === "done") && job.count !== null && free(job);
    });
    if (!next) return;
    presenting.current = true;
    handled.current.add(next.id);
    setHandledCount((count) => count + 1);
    void present(next).finally(() => {
      presenting.current = false;
      if (mounted.current) setTick((count) => count + 1);
    });
    // `present` reads what it needs from refs and the hook's functions at the time it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, loaded, tick]);

  // A job that ended without a result to review (superseded, cancelled, lost) keeps no photo in memory.
  useEffect(() => {
    for (const job of jobs) {
      if (job.kind !== "analyze") continue;
      if (job.status === "superseded" || job.status === "cancelled" || (job.status === "failed" && job.errorCode === "ai_job_lost" && handled.current.has(job.id))) {
        releasePhoto(job.id);
      }
    }
  }, [jobs]);

  // The numbers of the result shown: fetched once the job has ended.
  useEffect(() => {
    const current = shown.current;
    if (!current?.numbersPending || fetchingNumbers.current || current.jobId === "") return;
    const job = jobs.find((other) => other.id === current.jobId);
    if (job?.status === "running" || job?.status === "queued") return;
    fetchingNumbers.current = true;
    void (async () => {
      let numbers: PhotoNumbers = noNumbers;
      let points: PhotoPoints = null;
      if (job?.status !== "failed") {
        const fetched = await fetchResult(current.jobId);
        const parsed = fetched.ok ? photoJobResultSchema.safeParse(fetched.data.result) : null;
        if (parsed?.success) {
          points = parsed.data.points;
          numbers = numbersOf(points, current.labels);
        }
      }
      fetchingNumbers.current = false;
      // Another result has taken its place, or Hemma was left meanwhile: the numbers are not for it.
      if (shown.current !== current || !mounted.current) return;
      current.numbersPending = false;
      if (current.url) setNumbers(current.url, numbers);
      // Story 10.1: the points go with the saved photo too.
      if (numbers.kind === "ready") current.save?.located([...numbers.points.values()]);
      if (!current.url && points !== null) setTick((count) => count + 1);
    })();
    // setNumbers only sets state; the job's id and its status in the list are what decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, tick]);

  const looking = (siteId: string, location: Location): Looking | null => {
    if (startings.has(placeKey(siteId, location))) return { waiting: null };
    const job = waitingJob(siteId, location);
    return job ? { waiting: waitingText(job) } : null;
  };

  const readyLocations = (siteId: string): Location[] => {
    const ready = new Set<Location>();
    for (const job of jobs) {
      if (job.kind !== "analyze" || job.count === null || handled.current.has(job.id)) continue;
      const place = jobPlace(job);
      if (place.siteId === siteId && place.location !== null) ready.add(place.location as Location);
    }
    if (result && result.site?.id === siteId && hasOpenCards(result)) ready.add(result.location);
    return [...ready];
  };

  return {
    result,
    reviewPhoto,
    photoGone,
    looking,
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
    analyze: (file, location, site) => void analyze(file, location, site),
    dropForGoneSite,
    retry,
    cancel,
    readyLocations,
    generation: () => generation.current,
    resultGeneration,
    latestSuggestions: (expected) =>
      generation.current === expected && latest.current ? latest.current.suggestions : null,
    latestResult: (expected) => (generation.current === expected ? latest.current : null),
    editSuggestions,
    editMissing,
    editResult,
    dropPhotoNumbers,
    photoSaver: (expected) => (currentSave.current?.generation === expected ? currentSave.current.save : null),
  };
}
