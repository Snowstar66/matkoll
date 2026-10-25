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
  useTransition,
} from "react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { postAi } from "@/lib/ai-client";
import { errorMessages, fail, type AppError } from "@/lib/errors";
import { saveRecipe } from "../actions/save-recipe";
import {
  importErrorMessage,
  importLinkTooLongMessage,
  importTextTooLongMessage,
  maxImportTextChars,
  maxImportUrlChars,
  pasteTextInsteadCodes,
  recipeImportSchema,
  type ImportKind,
  type ImportRequest,
} from "../domain/import";
import { validateDraft, type PendingFieldText, type RecipeDraft } from "../domain/recipe-draft";
import type { SearchIngredients } from "./ingredient-picker";
import { RecipePreview } from "./recipe-preview";

// Importera recept (FR-3, FR-4): a sheet with the tabs Länk, Text and Foto,
// opening on Länk. A link or pasted text is parsed by /api/ai/import through
// src/lib/ai-client.ts (AD-9), and the preview is shown in the same sheet.
// Nothing is saved until "Spara recept", which calls the Server Action
// saveRecipe and opens the recipe view.

type Tab = "link" | "text" | "photo";

const tabs: { id: Tab; label: string }[] = [
  { id: "link", label: "Länk" },
  { id: "text", label: "Text" },
  { id: "photo", label: "Foto" },
];

/** The tab each import kind is made from. */
const tabFor: Record<ImportKind, Tab> = { url: "link", text: "text" };

type Preview = {
  /** Increases with every import, so the preview starts afresh. */
  key: number;
  /** What the preview was parsed from: the link or the text, as it was sent. */
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
    (kind === "url" ? urlRef : textRef).current?.focus();
  }, [view, tab]);

  /** The import kind of the open tab; the photo tab has none yet. */
  const kind: ImportKind | null = tab === "link" ? "url" : tab === "text" ? "text" : null;
  const valueFor = (of: ImportKind) => (of === "url" ? url : text);
  /** The preview was parsed from what is in the open tab's field right now. */
  const previewMatchesInput =
    preview !== null && kind !== null && preview.source.kind === kind && preview.source.value === valueFor(kind);

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
    setTab(next);
  }

  function requestParse() {
    // One import at a time: Enter in the read-only field while reading does nothing.
    if (view === "reading" || kind === null || !valueFor(kind).trim()) return;
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

  async function parse(of: ImportKind) {
    setConfirm(null);
    if (!valueFor(of).trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setView("reading");

    const value = valueFor(of);
    const body: ImportRequest = of === "url" ? { kind: "url", url: value } : { kind: "text", text: value };
    const result = await postAi<unknown>("/api/ai/import", body, controller.signal);
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
    let action: ReactNode = null;
    if (shown.code === "fetch_domain_not_allowed") {
      action = (
        <Button variant="text" onClick={requestSettings}>
          Öppna inställningar
        </Button>
      );
    } else if (of === "url" && pasteTextInsteadCodes.has(shown.code)) {
      action = (
        <Button variant="text" onClick={pasteTextInstead}>
          Klistra in text i stället
        </Button>
      );
    } else if (retryable.has(shown.code)) {
      action = (
        <Button variant="text" onClick={requestParse}>
          Försök igen
        </Button>
      );
    }
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
  if (view === "input" && kind !== null && confirm !== null) {
    footer = (
      <>
        <p role="alert" className="text-body text-ink">
          Släng ändringarna?
        </p>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => (confirm === "settings" ? openSettings() : void parse(kind))}
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
            if (keepPreview) setView("preview");
          }}
        >
          Fortsätt ändra
        </Button>
      </>
    );
  } else if (view === "input" && kind !== null) {
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
            backLabel={preview.source.kind === "url" ? "Tillbaka till länken" : "Tillbaka till texten"}
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
                <EmptyState className="py-8">Kommer snart.</EmptyState>
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
