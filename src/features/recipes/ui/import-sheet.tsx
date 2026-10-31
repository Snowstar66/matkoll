"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  Suspense,
  use,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useCoarsePointer } from "@/components/use-coarse-pointer";
import { downscaleImage } from "@/lib/downscale-image";
import { useAiJobs, useShowingAiResults } from "@/lib/ai-jobs-client";
import { type AiJob } from "@/lib/ai-job-shape";
import { fail, isErrorCode, type AppError } from "@/lib/errors";
import {
  importErrorMessage,
  importLinkTooLongMessage,
  importTextTooLongMessage,
  maxImportTextChars,
  maxImportUrlChars,
  isUnreadablePhoto,
  offersPasteTextInstead,
  type ImportKind,
} from "../domain/import";
import { kindOfJob } from "./saved-imports";
import { appName } from "@/app/app-info";
import { AiWorking } from "@/components/ai-working";

// Importera recept (FR-3, FR-4): a sheet with the tabs Länk, Text and Foto,
// opening on Länk. A link or pasted text becomes an AI job (POST /api/ai/jobs)
// and a photo too (POST /api/ai/jobs/photo), Story 12.6: the sheet can be
// closed meanwhile and the next recipe read in at once. The jobs are read
// through src/lib/ai-jobs-client.ts. Story 1.15: there is no preview. The job
// saves the recipe when it is read, and when the job the sheet waits on is
// done the sheet closes; SavedImports (saved-imports.tsx) says "Receptet X är
// sparat" with "Öppna" and "Ångra". A failure is shown in the tab it was made
// from. A photo is made small in the browser first (AD-15) and kept in memory
// only while the sheet is open, for "Försök igen".

type Tab = "link" | "text" | "photo";

const tabs: { id: Tab; label: string }[] = [
  { id: "link", label: "Länk" },
  { id: "text", label: "Text" },
  { id: "photo", label: "Foto" },
];

/** The tab each import kind is made from. */
const tabFor: Record<ImportKind, Tab> = { url: "link", text: "text", photo: "photo" };
const kindFor: Record<Tab, ImportKind> = { link: "url", text: "text", photo: "photo" };

/** A photo, made small and ready to send; `id` tells one photo from the next. */
type Photo = { id: number; image: Blob };

/** The errors "Försök igen" can help with: the model was away or answered badly, or a read failed. */
const retryable = new Set<AppError["code"]>([
  "ai_unavailable",
  "ai_invalid",
  "catalog_unavailable",
  "settings_unavailable",
]);

/** The job the sheet waits on, with what it was made from (the link or text sent; "" for a photo or a job that was opened with "Visa"). */
type Watch = { id: string; kind: ImportKind; value: string };

/** The newest failed import that has not been shown, for "Visa". */
function newestUnseenFailure(jobs: readonly AiJob[], handled: ReadonlySet<string>): AiJob | undefined {
  return jobs
    .filter((job) => job.kind === "import" && job.status === "failed" && !job.seen && !handled.has(job.id))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

/** How many "Visa" taps for imports have been handled, kept across pages so the sheet opens once per tap. */
let handledRevealCount = 0;

/** From this length on, the text field shows how much is left. */
const counterFrom = Math.floor(maxImportTextChars * 0.9);
const formatCount = (n: number) => n.toLocaleString("sv-SE");

export type ImportSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The sheet was opened with "Visa" for a finished import: it shows that job. */
  showFinished?: boolean;
  /** Story 1.13: a shared link to read as soon as the sheet is on screen, or a shared value that is not a usable link. */
  autoImport?: AutoImport;
  /** Story 1.14: the approved recipe sites (sorted domains), for "Hitta recept på nätet". Without it the section says there are none. */
  sites?: Promise<readonly string[]>;
};

export type AutoImport = { kind: "ok"; url: string } | { kind: "invalid"; value: string };

export function ImportSheet({ open, onClose, showFinished = false, autoImport, sites }: ImportSheetProps) {
  const ids = useId();
  const { jobs, loaded, start, cancel: cancelJob, dismiss } = useAiJobs();
  /** The job the sheet waits on while it reads. */
  const [watch, setWatchState] = useState<Watch | null>(null);
  const watchRef = useRef<Watch | null>(null);
  /** The finished jobs whose result or failure the sheet has taken, so none is taken twice. */
  const handledJobs = useRef(new Set<string>());
  function setWatch(next: Watch | null) {
    watchRef.current = next;
    setWatchState(next);
  }
  const [tab, setTab] = useState<Tab>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  /** The last photo that could be made small, kept for "Försök igen" until the sheet closes. */
  const [photo, setPhoto] = useState<Photo | null>(null);
  const photoCount = useRef(0);
  const [view, setView] = useState<"input" | "reading">("input");
  /** The last import's error, shown in the tab it was made from. */
  const [error, setError] = useState<{ kind: ImportKind; error: AppError } | null>(null);
  /**
   * "Släng ändringarna?" before "Öppna inställningar" leaves the sheet with pasted text
   * that has not been read.
   */
  /** The page under /installningar the pending "Öppna inställningar" goes to. */
  const settingsHash = useRef("");
  const [confirm, setConfirm] = useState<"settings" | null>(null);
  /** The pasted link was longer than a link may be, so it was not put in the field. */
  const [pastedTooLong, setPastedTooLong] = useState(false);
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  /** The photo tab's first button, "Fotografera sidan" or "Välj bild". */
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  /** A phone or tablet: the camera button is shown. Desktops get the file picker only (EXPERIENCE.md, Responsive). */
  const touch = useCoarsePointer();
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  /** The field to focus once the input view shows the tab. */
  const focusField = useRef<ImportKind | null>(null);

  // A job goes on when the sheet goes away; only what is waiting for its start is let go.
  useEffect(
    () => () => {
      request.current = null;
    },
    [],
  );

  // Story 1.13: a shared link is read once, from here, in the browser, never when the page is
  // rendered on the server (so a prefetch of the link reads nothing). The timer is cleared by
  // Strict Mode's extra cleanup, and the ref keeps a second run from starting a second import.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!open || !autoImport || autoStarted.current) return;
    const timer = setTimeout(() => {
      autoStarted.current = true;
      if (autoImport.kind === "ok") {
        setUrl(autoImport.url);
        void parse("url", null, autoImport.url);
      } else {
        setUrl(autoImport.value);
        setError({ kind: "url", error: fail("fetch_invalid_url").error });
        focusField.current = "url";
      }
    }, 0);
    return () => clearTimeout(timer);
    // parse is this render's; the shared link and the open sheet decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoImport]);

  useEffect(() => {
    const kind = focusField.current;
    if (view !== "input" || kind === null || tab !== tabFor[kind]) return;
    focusField.current = null;
    (kind === "url" ? urlRef : kind === "text" ? textRef : photoButtonRef).current?.focus();
  }, [view, tab]);

  /** The import kind of the open tab. */
  const kind = kindFor[tab];
  /** What an import of this kind sends: the link, the text, or the id of the kept photo ("" when there is none). */
  const valueFor = (of: ImportKind) => (of === "url" ? url : of === "text" ? text : photo ? String(photo.id) : "");
  // Pasted text that has not been read counts as unsaved, so closing never loses it silently.
  // A link does not: it is quick to paste again.
  const isDirty = text.trim() !== "" && view !== "reading";

  function close() {
    // The job the sheet waits on goes on (Pontus can read in the next recipe).
    setWatch(null);
    request.current = null;
    setTab("link");
    setUrl("");
    setText("");
    setPhoto(null);
    setView("input");
    setError(null);
    setConfirm(null);
    setPastedTooLong(false);
    onClose();
  }

  /** A tab change also drops a pending "Släng ändringarna?", which was about the other tab. */
  function changeTab(next: Tab) {
    setConfirm(null);
    setTab(next);
  }

  function requestParse() {
    // One import at a time: Enter in the read-only field while reading does nothing.
    if (view === "reading" || !valueFor(kind).trim()) return;
    void parse(kind);
  }

  /** "Öppna inställningar": leaves the sheet, asking first when there are unsaved changes, like closing. */
  function requestSettings() {
    settingsHash.current = "";
    if (isDirty) setConfirm("settings");
    else openSettings();
  }

  function openSettings(hash = "") {
    close();
    router.push(`/installningar${hash}`);
  }

  /** The links to Inställningar in "Hitta recept på nätet": leaves the sheet, asking first when there are unsaved changes. */
  function goToSettings(hash: string) {
    settingsHash.current = hash;
    if (isDirty) setConfirm("settings");
    else openSettings(hash);
  }

  /**
   * Sends the link, the text or the photo (the kept one unless `photoToSend`
   * is given) and waits for the job. A photo that is sent becomes the kept
   * one, for "Försök igen".
   */
  async function parse(of: ImportKind, photoToSend: Photo | null = photo, valueOverride?: string) {
    setConfirm(null);
    const value = of === "photo" ? (photoToSend ? String(photoToSend.id) : "") : (valueOverride ?? valueFor(of));
    if (!value.trim()) return;
    if (of === "photo") setPhoto(photoToSend);
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setView("reading");

    let started: Awaited<ReturnType<typeof start>>;
    if (of === "photo" && photoToSend) {
      const form = new FormData();
      form.append("image", photoToSend.image, "photo");
      form.append("kind", "import");
      started = await start("/api/ai/jobs/photo", form, crypto.randomUUID());
    } else {
      const body = of === "url" ? { kind: "import", source: "url", url: value } : { kind: "import", source: "text", text: value };
      started = await start("/api/ai/jobs", body, crypto.randomUUID());
    }
    // "Avbryt" while the job was being started: it is stopped now that its id is known.
    if (started.ok && controller.signal.aborted) {
      void cancelJob(started.data.job.id);
      return;
    }
    // Closed meanwhile: the job goes on, and its confirmation says when it is done.
    if (request.current !== controller) return;
    request.current = null;

    if (!started.ok) {
      // An expired session: the page sends Pontus to sign in.
      if (started.error.code === "unauthorized") router.refresh();
      setError({ kind: of, error: started.error });
      focusField.current = of;
      setView("input");
      return;
    }
    setWatch({ id: started.data.job.id, kind: of, value });
  }

  // The job the sheet waits on: its draft when it is done, its error when it failed, back to the form when it is gone.
  const watched = watch ? jobs.find((job) => job.id === watch.id) : undefined;
  const watchedStatus = watched?.status;
  const watchedCode = watched?.errorCode ?? null;
  useEffect(() => {
    if (!watch || view !== "reading") return;
    if (!watchedStatus) {
      // Cancelled from the list of jobs, or closed on another device.
      if (loaded) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the job the sheet waits on is gone from the list.
        setWatch(null);
        setView("input");
      }
      return;
    }
    if ((watchedStatus !== "done" && watchedStatus !== "failed") || handledJobs.current.has(watch.id)) return;
    handledJobs.current.add(watch.id);
    const { id, kind: of } = watch;
    const goBack = (shown: AppError) => {
      setWatch(null);
      setError({ kind: of, error: shown });
      focusField.current = of;
      setView("input");
    };
    if (watchedStatus === "failed") {
      const code = watchedCode !== null && isErrorCode(watchedCode) ? watchedCode : "ai_unavailable";
      // The site is named for a refusal or a slow answer; not for a redirect to another site, which is not the job's own.
      const domain = watched?.context.domain;
      goBack(fail(code, typeof domain === "string" && code !== "fetch_domain_not_allowed" ? { domain } : undefined).error);
      // The failure is shown here, so the job has done its part.
      void dismiss(id);
      return;
    }
    // Done: the job has saved the recipe, and SavedImports says so; the sheet has done its part.
    close();
    // The functions of useAiJobs change with the list; the job and its status decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, view, watchedStatus, watchedCode, loaded]);

  // "Visa" on a failed import: the sheet shows that job's error, the same way as when it waited on it.
  useEffect(() => {
    if (!open || !showFinished || view !== "input" || watch) return;
    const job = newestUnseenFailure(jobs, handledJobs.current);
    if (!job) return;
    setWatch({ id: job.id, kind: kindOfJob(job), value: "" });
    setView("reading");
  }, [open, showFinished, view, watch, jobs]);

  // The result is on the screen while the sheet waits on a job or shows its draft: no confirmation says what is there.
  useShowingAiResults("import", open && view === "reading");

  /**
   * A photo from the camera or the file picker: made small in the browser
   * (AD-15), kept for "Försök igen", then sent. "Läser receptet …" shows from
   * the start, and "Avbryt" works while the photo is made small too. A photo
   * that cannot be read or made small enough is never sent.
   */
  async function choosePhoto(file: File) {
    setConfirm(null);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setView("reading");

    const prepared = await downscaleImage(file);
    // Cancelled or closed meanwhile.
    if (request.current !== controller) return;
    request.current = null;
    if (!prepared.ok) {
      // The photo kept from before stays, so "Försök igen" still works.
      setError({ kind: "photo", error: prepared.error });
      focusField.current = "photo";
      setView("input");
      return;
    }
    photoCount.current += 1;
    const next: Photo = { id: photoCount.current, image: prepared.data };
    void parse("photo", next);
  }

  /** The chosen file; the field is emptied so the same photo can be chosen again. */
  function onPhotoChosen(event: { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void choosePhoto(file);
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    if (watch) void cancelJob(watch.id);
    setWatch(null);
    focusField.current = kind;
    setView("input");
  }

  /** "Klistra in länk": the clipboard's text, read only on this tap. Nothing happens if the browser says no. */
  async function pasteLink() {
    try {
      const pasted = (await navigator.clipboard.readText()).trim();
      if (!pasted) return;
      // A link that is too long is never cut: a cut link would lead somewhere else.
      setPastedTooLong(pasted.length > maxImportUrlChars);
      if (pasted.length <= maxImportUrlChars) setUrl(pasted);
    } catch {
      // No permission or no clipboard API: the field stays as it is.
    }
  }

  /** "Ta en ny bild" / "Välj en annan bild": focus on the photo tab's first button, and its camera or file picker opened. */
  function newPhoto() {
    photoButtonRef.current?.focus();
    (touch ? cameraRef : pickerRef).current?.click();
  }

  /** "Klistra in text i stället": the Text tab, with focus in its field. */
  function pasteTextInstead() {
    focusField.current = "text";
    changeTab("text");
  }

  /** "klistra in den här": the Länk tab, with focus in its field. */
  function focusLinkField() {
    focusField.current = "url";
    changeTab("link");
    urlRef.current?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex(({ id }) => id === tab);
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    else return;
    event.preventDefault();
    changeTab(tabs[next].id);
    tabRefs.current.get(tabs[next].id)?.focus();
  }

  const reading = view === "reading";
  /** While the job waits behind others: "I kö, 1 före."; otherwise null. */
  const waiting = watched?.status === "queued" && watched.ahead > 0 ? `I kö, ${watched.ahead} före.` : null;
  const tooLong = text.length >= maxImportTextChars;

  /** The error notice for an import kind, with the way forward that fits it. */
  function errorNotice(of: ImportKind) {
    if (error?.kind !== of) return null;
    const { error: shown } = error;
    const actions: ReactNode[] = [];
    if (shown.code === "fetch_domain_not_allowed") {
      actions.push(
        <Button key="settings" variant="text" onClick={requestSettings}>
          Öppna inställningar
        </Button>,
      );
    }
    // A photo the model could not read may work on a second try, as may an answer that was away or invalid.
    if (retryable.has(shown.code) || isUnreadablePhoto(shown.code, of)) {
      actions.push(
        <Button key="retry" variant="text" onClick={requestParse}>
          Försök igen
        </Button>,
      );
    }
    if (isUnreadablePhoto(shown.code, of)) {
      actions.push(
        <Button key="new-photo" variant="text" onClick={newPhoto}>
          {touch ? "Ta en ny bild" : "Välj en annan bild"}
        </Button>,
      );
    }
    if (offersPasteTextInstead(shown.code, of)) {
      actions.push(
        <Button key="paste" variant="text" onClick={pasteTextInstead}>
          Klistra in text i stället
        </Button>,
      );
    }
    const action = actions.length > 0 ? <div className="flex flex-wrap">{actions}</div> : null;
    return (
      <Notice role="alert" action={action}>
        {importErrorMessage(shown, of)}
      </Notice>
    );
  }

  let footer: ReactNode = null;
  if (view === "input" && confirm !== null) {
    footer = (
      <>
        <p role="alert" className="text-body text-ink">
          Släng ändringarna?
        </p>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => openSettings(settingsHash.current)}
        >
          Släng ändringarna
        </Button>
        <Button
          variant="text"
          fullWidth
          autoFocus
          onClick={() => setConfirm(null)}
        >
          Fortsätt ändra
        </Button>
      </>
    );
  } else if (view === "input" && kind === "photo") {
    // The camera on a phone, the file picker on a desktop (EXPERIENCE.md, Responsive). On a phone
    // "Välj bild" is there too, for a photo taken earlier. No camera API beyond the file input.
    footer = (
      <>
        {touch ? (
          <Button ref={photoButtonRef} fullWidth onClick={() => cameraRef.current?.click()}>
            Fotografera sidan
          </Button>
        ) : null}
        <Button
          ref={touch ? undefined : photoButtonRef}
          variant={touch ? "text" : "primary"}
          fullWidth
          onClick={() => pickerRef.current?.click()}
        >
          Välj bild
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={onPhotoChosen}
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={onPhotoChosen}
        />
      </>
    );
  } else if (view === "input") {
    footer = (
      <Button fullWidth disabled={!valueFor(kind).trim()} onClick={requestParse}>
        Tolka
      </Button>
    );
  } else if (reading) {
    footer = (
      <Button variant="secondary" fullWidth onClick={cancel}>
        Avbryt
      </Button>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Importera recept"
      closeLabel="Stäng"
      isDirty={isDirty}
      footer={footer}
    >
      {(
        <div className="flex flex-col gap-4">
          <div role="tablist" aria-label="Importera från" className="flex rounded-md bg-bg p-1">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                ref={(element) => {
                  if (element) tabRefs.current.set(id, element);
                  else tabRefs.current.delete(id);
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${id}`}
                aria-selected={tab === id}
                aria-controls={`${ids}-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                disabled={reading}
                onClick={() => changeTab(id)}
                onKeyDown={onTabKeyDown}
                className={
                  tab === id
                    ? "min-h-tap flex-1 rounded-sm bg-surface text-body font-semibold text-ink"
                    : "min-h-tap flex-1 rounded-sm text-body text-ink-2"
                }
              >
                {label}
              </button>
            ))}
          </div>

          {tabs.map(({ id }) => (
            <div
              key={id}
              role="tabpanel"
              id={`${ids}-panel-${id}`}
              aria-labelledby={`${ids}-tab-${id}`}
              hidden={tab !== id}
            >
              {id === "link" ? (
                <div className="flex flex-col gap-3">
                  {errorNotice("url")}
                  <FieldLabel htmlFor={`${ids}-url`}>Länk till receptet</FieldLabel>
                  <Input
                    ref={urlRef}
                    id={`${ids}-url`}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={url}
                    maxLength={maxImportUrlChars}
                    readOnly={reading}
                    placeholder="https://www.koket.se/…"
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setPastedTooLong(false);
                    }}
                    aria-invalid={pastedTooLong || undefined}
                    aria-describedby={pastedTooLong ? `${ids}-url-too-long` : undefined}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        requestParse();
                      }
                    }}
                  />
                  {pastedTooLong ? <FieldError id={`${ids}-url-too-long`}>{importLinkTooLongMessage}</FieldError> : null}
                  <Button variant="text" onClick={() => void pasteLink()} disabled={reading} className="-ml-3 self-start">
                    Klistra in länk
                  </Button>
                  {/* Mounted empty, so the text is announced when it appears. */}
                  <div role="status">{reading && tab === "link" ? <Reading waiting={waiting} /> : null}</div>
                </div>
              ) : id === "text" ? (
                <div className="flex flex-col gap-3">
                  {errorNotice("text")}
                  <FieldLabel htmlFor={`${ids}-text`}>Recepttext</FieldLabel>
                  <textarea
                    ref={textRef}
                    id={`${ids}-text`}
                    rows={10}
                    value={text}
                    maxLength={maxImportTextChars}
                    readOnly={reading}
                    placeholder="Klistra in receptet här, med ingredienser och steg."
                    onChange={(event) => setText(event.target.value)}
                    aria-describedby={text.length >= counterFrom ? `${ids}-count` : undefined}
                    aria-invalid={tooLong || undefined}
                    className="min-h-48 w-full rounded-md border border-ink-3 bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-sky-ink"
                  />
                  {text.length >= counterFrom ? (
                    <div id={`${ids}-count`} className="flex flex-col gap-1">
                      <p className="text-meta text-ink-2">
                        {formatCount(text.length)} av {formatCount(maxImportTextChars)} tecken
                      </p>
                      {tooLong ? <FieldError>{importTextTooLongMessage}</FieldError> : null}
                    </div>
                  ) : null}
                  {/* Mounted empty, so the text is announced when it appears. */}
                  <div role="status">{reading && tab === "text" ? <Reading waiting={waiting} /> : null}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {errorNotice("photo")}
                  <p className="text-body text-ink-2">
                    {touch ? "Fotografera receptsidan i kokboken" : "Välj ett foto av receptsidan i kokboken"}, så läser
                    AI-tjänsten av receptet. Bilden sparas inte.
                  </p>
                  {/* Mounted empty, so the text is announced when it appears. */}
                  <div role="status">{reading && tab === "photo" ? <Reading waiting={waiting} /> : null}</div>
                </div>
              )}
            </div>
          ))}

          <Suspense fallback={null}>
            <FindRecipes sites={sites} onSettings={goToSettings} onPaste={focusLinkField} />
          </Suspense>
        </div>
      )}
    </Sheet>
  );
}

/**
 * "Hitta recept på nätet" (Story 1.14): one link per approved recipe site, to
 * its start page in a new tab. Matkoll fetches nothing from them; the recipe
 * comes back through the bookmarklet or the pasted link.
 */
function FindRecipes({
  sites,
  onSettings,
  onPaste,
}: {
  sites: Promise<readonly string[]> | undefined;
  onSettings: (hash: string) => void;
  onPaste: () => void;
}) {
  const domains = sites ? use(sites) : [];
  const headingId = useId();
  const linkClass = "text-accent underline";
  return (
    <section aria-labelledby={headingId} data-testid="find-recipes" className="mt-6 flex flex-col gap-3 border-t border-hairline pt-4">
      <h3 id={headingId} className="text-section-label text-ink-2">
        Hitta recept på nätet
      </h3>
      {domains.length > 0 ? (
        <>
          <ul className="flex flex-wrap gap-2">
            {domains.map((domain) => (
              <li key={domain}>
                <a
                  href={`https://${domain}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Öppna ${domain} i en ny flik`}
                  className="flex min-h-tap items-center rounded-full bg-surface px-4 text-body text-ink"
                >
                  {domain}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-meta text-ink-2">
            Hittat ett recept? Använd bokmärket{" "}
            <Link
              href="/installningar/spara-i-matkoll"
              onClick={(event) => {
                event.preventDefault();
                onSettings("/spara-i-matkoll");
              }}
              className={linkClass}
            >
              Spara i {appName}
            </Link>{" "}
            på datorn, eller kopiera länken och klistra in den{" "}
            <button type="button" onClick={onPaste} className={`${linkClass} min-h-tap`}>
              här
            </button>
            .
          </p>
        </>
      ) : (
        <p className="text-meta text-ink-2">
          Inga godkända receptsajter än.{" "}
          <Link
            href="/installningar/receptsajter"
            onClick={(event) => {
              event.preventDefault();
              onSettings("/receptsajter");
            }}
            className={linkClass}
          >
            Lägg till en i Inställningar
          </Link>
          .
        </p>
      )}
    </section>
  );
}

/** "Läser receptet …" with a progress bar (EXPERIENCE.md, Import pågår), and "I kö, 1 före." while it waits. */
/** One call takes a link, a pasted text or a photo, so the words hold for all three. */
const recipeSteps = ["Läser receptet …", "Tolkar innehållet …", "Sätter ihop receptet …"];

function Reading({ waiting }: { waiting: string | null }) {
  return (
    <div className="flex flex-col gap-2">
      {waiting ? <p className="text-body text-ink">{waiting}</p> : <AiWorking inLiveRegion steps={recipeSteps} />}
      <p className="text-meta text-ink-2">Du kan göra annat under tiden.</p>
      <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-hairline">
        <div className="h-full w-1/3 rounded-full bg-accent motion-safe:animate-progress" />
      </div>
    </div>
  );
}

type ImportContextValue = { openImport: () => void };

const ImportContext = createContext<ImportContextValue | null>(null);

/**
 * Holds the import sheet for a page, so the "+" in the header and the button in
 * the empty library open the same sheet.
 */
export function ImportRecipeProvider({
  autoImport,
  sites,
  children,
}: {
  /** Story 1.13: opens the sheet on a shared link; closing it goes back to /recept. */
  autoImport?: AutoImport;
  /** Story 1.14: the approved recipe sites, read on the server and waited for inside the sheet. */
  sites?: Promise<readonly string[]>;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoImport !== undefined);
  /** Opened with "Visa" for a finished import, not with the "+". */
  const [showFinished, setShowFinished] = useState(false);
  const { reveals } = useAiJobs();

  // "Visa" in the confirmation of a finished import (also from another page) opens the sheet on that job.
  const revealed = reveals.import;
  useEffect(() => {
    if (revealed <= handledRevealCount) return;
    handledRevealCount = revealed;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- "Visa" in a confirmation opens the sheet.
    setShowFinished(true);
    setOpen(true);
  }, [revealed]);

  return (
    <ImportContext.Provider
      value={{
        openImport: () => {
          setShowFinished(false);
          setOpen(true);
        },
      }}
    >
      {children}
      <ImportSheet
        open={open}
        showFinished={showFinished}
        autoImport={autoImport}
        sites={sites}
        onClose={() => {
          setOpen(false);
          setShowFinished(false);
          // The shared link is spent: a reload must not read it again.
          if (autoImport) router.replace("/recept");
        }}
      />
    </ImportContext.Provider>
  );
}

/** Opens Importera recept: the round "+" for the page header, or a primary button. */
export function ImportRecipeButton({ variant }: { variant: "icon" | "primary" }) {
  const context = useContext(ImportContext);
  if (!context) throw new Error("ImportRecipeButton needs an ImportRecipeProvider");
  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Importera recept"
        onClick={context.openImport}
        className="flex size-tap items-center justify-center rounded-full text-accent"
      >
        <PlusIcon size={26} />
      </button>
    );
  }
  return <Button onClick={context.openImport}>Importera recept</Button>;
}
