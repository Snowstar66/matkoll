"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { postAi, postAiForm, type AiCallResult } from "@/lib/ai-client";
import { errorMessages, fail, type AppError } from "@/lib/errors";
import { saveRecipe } from "../actions/save-recipe";
import {
  importErrorMessage,
  importLinkTooLongMessage,
  importTextTooLongMessage,
  maxImportTextChars,
  maxImportUrlChars,
  isUnreadablePhoto,
  offersPasteTextInstead,
  recipeImportSchema,
  type ImportKind,
  type ImportRequest,
} from "../domain/import";
import { validateDraft, type PendingFieldText, type RecipeDraft } from "../domain/recipe-draft";
import { downscaleImage } from "./downscale-image";
import type { SearchIngredients } from "./ingredient-picker";
import { RecipePreview } from "./recipe-preview";

// Importera recept (FR-3, FR-4): a sheet with the tabs Länk, Text and Foto,
// opening on Länk. A link or pasted text is parsed by /api/ai/import and a
// photo by /api/ai/import/photo, through src/lib/ai-client.ts (AD-9), and the
// preview is shown in the same sheet. A photo is made small in the browser
// first (AD-15) and kept in memory only while the sheet is open, for "Försök
// igen". Nothing is saved until "Spara recept", which calls the Server Action
// saveRecipe and opens the recipe view.

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

const backLabels: Record<ImportKind, string> = {
  url: "Tillbaka till länken",
  text: "Tillbaka till texten",
  photo: "Tillbaka till bilden",
};

type Preview = {
  /** Increases with every import, so the preview starts afresh. */
  key: number;
  /** What the preview was parsed from: the link or the text as it was sent, or the photo's id. */
  source: { kind: ImportKind; value: string };
  /** The id the recipe gets when saved, made with the preview, so saving it again never makes a copy. */
  recipeId: string;
  initial: RecipeDraft;
  draft: RecipeDraft;
  names: Readonly<Record<string, string>>;
  /** Typed text in the preview that did not become a value. */
  pending: PendingFieldText;
};

/** The errors "Försök igen" can help with: the model was away or answered badly, or a read failed. */
const retryable = new Set<AppError["code"]>([
  "ai_unavailable",
  "ai_invalid",
  "catalog_unavailable",
  "settings_unavailable",
]);

/** A phone or tablet: the camera button is shown. Desktops get the file picker only (EXPERIENCE.md, Responsive). */
const coarsePointer = "(pointer: coarse)";

function subscribePointer(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(coarsePointer);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribePointer,
    () => typeof window.matchMedia === "function" && window.matchMedia(coarsePointer).matches,
    () => false,
  );
}

/** From this length on, the text field shows how much is left. */
const counterFrom = Math.floor(maxImportTextChars * 0.9);
const formatCount = (n: number) => n.toLocaleString("sv-SE");

function hasPending({ totalMinutes, amounts }: PendingFieldText): boolean {
  return totalMinutes !== undefined || Object.keys(amounts ?? {}).length > 0;
}

/** Pontus has changed the preview: a field, or text that has not become a value yet. */
function isEdited(preview: Preview | null): boolean {
  return (
    preview !== null &&
    (hasPending(preview.pending) || JSON.stringify(preview.draft) !== JSON.stringify(preview.initial))
  );
}

export type ImportSheetProps = {
  open: boolean;
  onClose: () => void;
  searchIngredients: SearchIngredients;
};

export function ImportSheet({ open, onClose, searchIngredients }: ImportSheetProps) {
  const ids = useId();
  const [tab, setTab] = useState<Tab>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  /** The last photo that could be made small, kept for "Försök igen" until the sheet closes. */
  const [photo, setPhoto] = useState<Photo | null>(null);
  /**
   * A new photo chosen over an edited preview, waiting for "Släng ändringarna?".
   * It replaces `photo` only when it is sent; "Fortsätt ändra" drops it.
   */
  const [pendingPhoto, setPendingPhoto] = useState<Photo | null>(null);
  const photoCount = useRef(0);
  const [view, setView] = useState<"input" | "reading" | "preview">("input");
  /** The last import's error, shown in the tab it was made from. */
  const [error, setError] = useState<{ kind: ImportKind; error: AppError } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  /**
   * "Släng ändringarna?" before a new parse replaces an edited preview, or
   * before "Öppna inställningar" leaves the sheet with unsaved changes.
   */
  const [confirm, setConfirm] = useState<"replace" | "settings" | null>(null);
  /** The pasted link was longer than a link may be, so it was not put in the field. */
  const [pastedTooLong, setPastedTooLong] = useState(false);
  const [saving, startSaving] = useTransition();
  /** Why "Spara recept" failed; the preview stays as it was. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const request = useRef<AbortController | null>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  /** The photo tab's first button, "Fotografera sidan" or "Välj bild". */
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const touch = useCoarsePointer();
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  /** The field to focus once the input view shows the tab. */
  const focusField = useRef<ImportKind | null>(null);
  /** Increases when the sheet closes; a save that answers after that is ignored. */
  const saveToken = useRef(0);

  // Stop a running import when the sheet goes away.
  useEffect(() => () => request.current?.abort(), []);

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
  /** The preview was parsed from what is in the open tab's field (or the kept photo) right now. */
  const previewMatchesInput =
    preview !== null && preview.source.kind === kind && preview.source.value === valueFor(kind);

  const edited = isEdited(preview);
  // Pasted text that has not been parsed counts too, so closing never loses it silently.
  // A link does not: it is quick to paste again.
  const unparsedText = text.trim() !== "" && !(preview?.source.kind === "text" && preview.source.value === text);
  const isDirty = edited || unparsedText;
  const errors = preview ? validateDraft(preview.draft, preview.pending) : {};
  /** "Spara recept" saves only a valid draft. */
  const isValid = Object.keys(errors).length === 0;

  function close() {
    saveToken.current += 1;
    request.current?.abort();
    request.current = null;
    setTab("link");
    setUrl("");
    setText("");
    setPhoto(null);
    setPendingPhoto(null);
    setView("input");
    setError(null);
    setPreview(null);
    setConfirm(null);
    setPastedTooLong(false);
    setSaveError(null);
    onClose();
  }

  /** "Spara recept": saves the draft, then closes the sheet and opens the recipe view. */
  function save() {
    if (!preview || !isValid || saving) return;
    const { draft, recipeId } = preview;
    const token = saveToken.current;
    setSaveError(null);
    startSaving(async () => {
      let result: Awaited<ReturnType<typeof saveRecipe>>;
      try {
        result = await saveRecipe(draft, recipeId);
      } catch {
        // The connection broke or the server failed: nothing to show but the save error.
        result = fail("recipe_save_failed");
      }
      // The sheet closed meanwhile (it cannot while saving, but never act on a stale answer).
      if (saveToken.current !== token) return;
      if (!result.ok) {
        setSaveError(result.error.code === "unauthorized" ? result.error.message : errorMessages.recipe_save_failed);
        return;
      }
      close();
      router.push(`/recept/${result.data.id}`);
      showToast("Receptet är sparat.");
    });
  }

  /** A tab change also drops a pending "Släng ändringarna?", which was about the other tab. */
  function changeTab(next: Tab) {
    setConfirm(null);
    setPendingPhoto(null);
    setTab(next);
  }

  function requestParse() {
    // One import at a time: Enter in the read-only field while reading does nothing.
    if (view === "reading" || !valueFor(kind).trim()) return;
    if (edited) setConfirm("replace");
    else void parse(kind);
  }

  /** "Öppna inställningar": leaves the sheet, asking first when there are unsaved changes, like closing. */
  function requestSettings() {
    if (isDirty) setConfirm("settings");
    else openSettings();
  }

  function openSettings() {
    close();
    router.push("/installningar");
  }

  /**
   * Sends the link, the text or the photo (the kept one unless `photoToSend`
   * is given) and shows the preview. A photo that is sent becomes the kept
   * one, for "Försök igen".
   */
  async function parse(of: ImportKind, photoToSend: Photo | null = photo) {
    setConfirm(null);
    setPendingPhoto(null);
    const value = of === "photo" ? (photoToSend ? String(photoToSend.id) : "") : valueFor(of);
    if (!value.trim()) return;
    if (of === "photo") setPhoto(photoToSend);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setView("reading");

    let result: AiCallResult<unknown>;
    if (of === "photo" && photoToSend) {
      const form = new FormData();
      form.append("image", photoToSend.image, "photo");
      result = await postAiForm<unknown>("/api/ai/import/photo", form, controller.signal);
    } else {
      const body: ImportRequest = of === "url" ? { kind: "url", url: value } : { kind: "text", text: value };
      result = await postAi<unknown>("/api/ai/import", body, controller.signal);
    }
    // Cancelled, closed or replaced by a newer import: this answer is not wanted.
    if (request.current !== controller) return;
    request.current = null;

    if (result.ok) {
      const parsed = recipeImportSchema.safeParse(result.data);
      if (parsed.success) {
        const { draft, ingredientNames } = parsed.data;
        setPreview((previous) => ({
          key: (previous?.key ?? 0) + 1,
          source: { kind: of, value },
          recipeId: crypto.randomUUID(),
          initial: draft,
          draft,
          names: ingredientNames,
          pending: {},
        }));
        setSaveError(null);
        setView("preview");
        return;
      }
      setError({ kind: of, error: fail("ai_invalid").error });
    } else if ("aborted" in result) {
      return;
    } else {
      setError({ kind: of, error: result.error });
    }
    focusField.current = of;
    setView("input");
  }

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
      // The photo kept from before stays, so "Försök igen" and its preview still work.
      setError({ kind: "photo", error: prepared.error });
      focusField.current = "photo";
      setView("input");
      return;
    }
    photoCount.current += 1;
    const next: Photo = { id: photoCount.current, image: prepared.data };
    if (edited) {
      // An edited preview is not replaced without asking, as for text; the new photo waits.
      setPendingPhoto(next);
      setView("input");
      setConfirm("replace");
      return;
    }
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

  /** "Visa förhandsgranskningen", when the preview was parsed from what is in the field. */
  const showPreviewButton =
    view === "input" && previewMatchesInput ? (
      <Button variant="text" onClick={() => setView("preview")} className="-ml-3 self-start">
        Visa förhandsgranskningen
      </Button>
    ) : null;

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
          onClick={() =>
            confirm === "settings" ? openSettings() : void parse(kind, kind === "photo" ? (pendingPhoto ?? photo) : null)
          }
        >
          Släng ändringarna
        </Button>
        <Button
          variant="text"
          fullWidth
          autoFocus
          onClick={() => {
            const keepPreview = confirm === "replace";
            setConfirm(null);
            setPendingPhoto(null);
            if (keepPreview) setView("preview");
          }}
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
  } else if (view === "preview" && preview) {
    footer = (
      <>
        {saveError ? <Notice role="alert">{saveError}</Notice> : null}
        <Button fullWidth disabled={!isValid || saving} onClick={save}>
          {saving ? "Sparar …" : "Spara recept"}
        </Button>
      </>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Importera recept"
      closeLabel="Stäng"
      isDirty={isDirty}
      preventClose={saving}
      footer={footer}
    >
      {view === "preview" && preview ? (
        // Nothing in the preview can change while it is being saved.
        <div data-valid={isValid} inert={saving}>
          <RecipePreview
            key={preview.key}
            draft={preview.draft}
            names={preview.names}
            onChange={(draft, names) => setPreview((current) => current && { ...current, draft, names })}
            pending={preview.pending}
            onPendingChange={(pending) => setPreview((current) => current && { ...current, pending })}
            errors={errors}
            searchIngredients={searchIngredients}
            backLabel={backLabels[preview.source.kind]}
            onBack={() => {
              focusField.current = preview.source.kind;
              changeTab(tabFor[preview.source.kind]);
              setView("input");
            }}
          />
        </div>
      ) : (
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
                  <div role="status">{reading && tab === "link" ? <Reading /> : null}</div>
                  {tab === "link" ? showPreviewButton : null}
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
                  <div role="status">{reading && tab === "text" ? <Reading /> : null}</div>
                  {tab === "text" ? showPreviewButton : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {errorNotice("photo")}
                  <p className="text-body text-ink-2">
                    {touch ? "Fotografera receptsidan i kokboken" : "Välj ett foto av receptsidan i kokboken"}, så läser
                    AI-tjänsten av receptet. Bilden sparas inte.
                  </p>
                  {/* Mounted empty, so the text is announced when it appears. */}
                  <div role="status">{reading && tab === "photo" ? <Reading /> : null}</div>
                  {tab === "photo" ? showPreviewButton : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/** "Läser receptet …" with a progress bar (EXPERIENCE.md, Import pågår). */
function Reading() {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body text-ink">Läser receptet …</p>
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
 * the empty library open the same sheet. `searchIngredients` comes from the
 * page, which may import the catalog's server entry (AD-1).
 */
export function ImportRecipeProvider({
  searchIngredients,
  children,
}: {
  searchIngredients: SearchIngredients;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <ImportContext.Provider value={{ openImport: () => setOpen(true) }}>
      {children}
      <ImportSheet open={open} onClose={() => setOpen(false)} searchIngredients={searchIngredients} />
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
