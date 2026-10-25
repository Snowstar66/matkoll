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
import { FieldError, FieldLabel } from "@/components/field";
import { PlusIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { postAi } from "@/lib/ai-client";
import { errorMessages, fail, type AppError } from "@/lib/errors";
import { saveRecipe } from "../actions/save-recipe";
import {
  importErrorMessage,
  importTextTooLongMessage,
  maxImportTextChars,
  recipeImportSchema,
  type ImportRequest,
} from "../domain/import";
import { validateDraft, type PendingFieldText, type RecipeDraft } from "../domain/recipe-draft";
import type { SearchIngredients } from "./ingredient-picker";
import { RecipePreview } from "./recipe-preview";

// Importera recept (FR-3, FR-4): a sheet with the tabs Länk, Text and Foto.
// Text is parsed by /api/ai/import through src/lib/ai-client.ts (AD-9), and
// the preview is shown in the same sheet. Nothing is saved until "Spara
// recept", which calls the Server Action saveRecipe and opens the recipe view.

type Tab = "link" | "text" | "photo";

const tabs: { id: Tab; label: string }[] = [
  { id: "link", label: "Länk" },
  { id: "text", label: "Text" },
  { id: "photo", label: "Foto" },
];

type Preview = {
  /** Increases with every import, so the preview starts afresh. */
  key: number;
  /** The text the preview was parsed from. */
  sourceText: string;
  /** The id the recipe gets when saved, made with the preview, so saving it again never makes a copy. */
  recipeId: string;
  initial: RecipeDraft;
  draft: RecipeDraft;
  names: Readonly<Record<string, string>>;
  /** Typed text in the preview that did not become a value. */
  pending: PendingFieldText;
};

/** The errors "Försök igen" can help with: the model was away or answered badly. */
const retryable = new Set<AppError["code"]>(["ai_unavailable", "ai_invalid", "catalog_unavailable"]);

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
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [view, setView] = useState<"input" | "reading" | "preview">("input");
  const [error, setError] = useState<AppError | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  /** "Släng ändringarna?" before a new parse replaces an edited preview. */
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [saving, startSaving] = useTransition();
  /** Why "Spara recept" failed; the preview stays as it was. */
  const [saveError, setSaveError] = useState<string | null>(null);
  const router = useRouter();
  const { showToast } = useToast();
  const request = useRef<AbortController | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const tabRefs = useRef(new Map<Tab, HTMLButtonElement>());
  const focusText = useRef(false);
  /** Increases when the sheet closes; a save that answers after that is ignored. */
  const saveToken = useRef(0);

  // Stop a running import when the sheet goes away.
  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (view !== "input" || !focusText.current) return;
    focusText.current = false;
    textRef.current?.focus();
  }, [view]);

  const edited = isEdited(preview);
  // Pasted text that has not been parsed counts too, so closing never loses it silently.
  const unparsedText = text.trim() !== "" && text !== preview?.sourceText;
  const isDirty = edited || unparsedText;
  const errors = preview ? validateDraft(preview.draft, preview.pending) : {};
  /** "Spara recept" saves only a valid draft. */
  const isValid = Object.keys(errors).length === 0;

  function close() {
    saveToken.current += 1;
    request.current?.abort();
    request.current = null;
    setTab("text");
    setText("");
    setView("input");
    setError(null);
    setPreview(null);
    setConfirmReplace(false);
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

  function requestParse() {
    if (!text.trim()) return;
    if (edited) setConfirmReplace(true);
    else void parse();
  }

  async function parse() {
    setConfirmReplace(false);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setView("reading");

    const sourceText = text;
    const body: ImportRequest = { kind: "text", text: sourceText };
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
          sourceText,
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
      setError(fail("ai_invalid").error);
    } else if ("aborted" in result) {
      return;
    } else {
      setError(result.error);
    }
    focusText.current = true;
    setView("input");
  }

  function cancel() {
    request.current?.abort();
    request.current = null;
    focusText.current = true;
    setView("input");
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
    setTab(tabs[next].id);
    tabRefs.current.get(tabs[next].id)?.focus();
  }

  const reading = view === "reading";
  const tooLong = text.length >= maxImportTextChars;

  let footer: ReactNode = null;
  if (view === "input" && tab === "text" && confirmReplace) {
    footer = (
      <>
        <p role="alert" className="text-body text-ink">
          Släng ändringarna?
        </p>
        <Button variant="secondary" fullWidth onClick={() => void parse()}>
          Släng ändringarna
        </Button>
        <Button
          variant="text"
          fullWidth
          autoFocus
          onClick={() => {
            setConfirmReplace(false);
            setView("preview");
          }}
        >
          Fortsätt ändra
        </Button>
      </>
    );
  } else if (view === "input" && tab === "text") {
    footer = (
      <Button fullWidth disabled={!text.trim()} onClick={requestParse}>
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
            onBack={() => {
              focusText.current = true;
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
                onClick={() => setTab(id)}
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
              {id === "text" ? (
                <div className="flex flex-col gap-3">
                  {error ? (
                    <Notice
                      role="alert"
                      action={
                        retryable.has(error.code) ? (
                          <Button variant="text" onClick={requestParse}>
                            Försök igen
                          </Button>
                        ) : null
                      }
                    >
                      {importErrorMessage(error)}
                    </Notice>
                  ) : null}
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
                  <div role="status">{reading ? <Reading /> : null}</div>
                  {view === "input" && preview && text === preview.sourceText ? (
                    <Button variant="text" onClick={() => setView("preview")} className="-ml-3 self-start">
                      Visa förhandsgranskningen
                    </Button>
                  ) : null}
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
