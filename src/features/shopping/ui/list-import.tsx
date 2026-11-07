"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { AiWorking } from "@/components/ai-working";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { cx } from "@/components/cx";
import { FieldLabel } from "@/components/field";
import { CameraIcon, ListIcon } from "@/components/icons";
import type { IngredientHit } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { postAiForm } from "@/lib/ai-client";
import { downscaleImage } from "@/lib/downscale-image";
import { fail, type Result } from "@/lib/errors";
import { newsKey } from "@/lib/news";
import { noteOwnNews } from "@/lib/news-client";
import { addCustomItem } from "../actions/add-custom-item";
import { removeCustomItem } from "../actions/remove-custom-item";
import {
  addedRowsText,
  addRowsText,
  alreadyOnListText,
  cancelText,
  itemsFromAi,
  maxImportTextChars,
  noItemsInTextText,
  noItemsOnPhotoText,
  parseListText,
  pasteChoiceText,
  pasteFieldLabel,
  pasteHelpText,
  pasteReadText,
  pasteTitle,
  photoChoiceText,
  readingText,
  reviewRows,
  reviewTitle,
  rowAmountText,
  rowToFormInput,
  type ExistingLines,
  type ListImportItem,
  type ReviewRow,
} from "../domain/list-import";

// "Fota en lista" and "Klistra in en lista" (Lägg till vara): two small choices under the field of the sheet. A photo of
// a list (a handwritten note, a screenshot of Microsoft To Do) is read by the AI through POST /api/shopping/read-list,
// pasted text is read here, without AI (parseListText). Both end in the same review: a row each with a tick box, the
// name and the amount, all ticked except what is on the list already ("Finns redan"); a name that is a catalog
// ingredient (or a synonym) is linked to it, as a suggestion picked while typing would be, so the item lands in the
// right section. "Lägg till 4 varor" adds the ticked rows as the household's own items (addCustomItem), the sheet
// closes and "Lade till 4 varor på inköpslistan." offers "Ångra", which removes exactly those. The photo is made small
// in the browser first (AD-15) and is never stored.

/** What the page passes down (AD-1: a client component never imports another module's actions): the catalog's match of names. */
export type MatchNames = (names: string[]) => Promise<Result<(IngredientHit | null)[]>>;

/** The view of the sheet: the form with the two choices, the pasted text, the photo being read, or the review. */
type Stage = { name: "form" } | { name: "paste"; text: string; error: string | null } | { name: "reading" } | { name: "review"; rows: ReviewRow[]; saving: boolean; error: string | null };

export type ListImportOptions = {
  /** The sheet is open; closing it stops a reading and goes back to the form. */
  open: boolean;
  /** Changes each time the sheet opens: the import starts over. */
  session: number;
  /** The catalog's match of names; without it no row is linked to the catalog. */
  matchNames?: MatchNames;
  /** What the list has already. */
  existing: ExistingLines;
  /** Closes the sheet (after the save). */
  onClose: () => void;
};

/** What the sheet shows instead of its form while an import is under way. */
export type ListImportView = {
  title: string;
  body: ReactNode;
  footer: ReactNode;
  onBack: () => void;
};

export type ListImport = {
  /** Something under way (pasted text, a reading, the review): the sheet shows `view` instead of the form. */
  view: ListImportView | null;
  /** The two choices, for the form. */
  choices: ReactNode;
  /** Why the last attempt gave nothing (shown under the choices in the form). */
  notice: ReactNode;
};

/** Photo, text and review of a list, as the sheet Lägg till vara uses them. */
export function useListImport({ open, session, matchNames, existing, onClose }: ListImportOptions): ListImport {
  const router = useRouter();
  const { showToast } = useToast();
  const ids = useId();
  const [stage, setStage] = useState<Stage>({ name: "form" });
  /** Why a photo gave no list; shown in the form. */
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [formSession, setFormSession] = useState(session);
  const request = useRef<AbortController | null>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const stop = useCallback(() => {
    request.current?.abort();
    request.current = null;
  }, []);

  // A new opening starts over (state adjusted while rendering); a closed sheet lets go of a reading.
  if (session !== formSession) {
    setFormSession(session);
    setStage({ name: "form" });
    setPhotoError(null);
  }
  useEffect(() => {
    if (!open) stop();
  }, [open, stop]);
  useEffect(() => stop, [stop]);

  function backToForm() {
    stop();
    setStage({ name: "form" });
  }

  /** The review of `items`, linked to the catalog; a match that fails leaves every row without a link. */
  async function review(items: ListImportItem[], signal: AbortSignal): Promise<ReviewRow[] | null> {
    let links: (IngredientHit | null)[] = [];
    if (matchNames) {
      try {
        const matched = await matchNames(items.map((item) => item.name));
        if (matched.ok) links = matched.data;
        else if (matched.error.code === "unauthorized") router.refresh();
      } catch {
        // No answer: the rows are added without a link, as typed items are when the suggestions are away.
      }
    }
    if (signal.aborted) return null;
    return reviewRows(items, links, existing);
  }

  async function readPhoto(file: File) {
    stop();
    const controller = new AbortController();
    request.current = controller;
    setPhotoError(null);
    setStage({ name: "reading" });
    const failed = (message: string) => {
      if (request.current !== controller) return;
      request.current = null;
      setPhotoError(message);
      setStage({ name: "form" });
    };

    const prepared = await downscaleImage(file);
    if (controller.signal.aborted) return;
    if (!prepared.ok) return failed(prepared.error.message);
    const body = new FormData();
    body.set("image", prepared.data, "list.jpg");
    const answer = await postAiForm<{ items: { name: string; amount: number | null; unit: string | null }[] }>("/api/shopping/read-list", body, controller.signal);
    if (request.current !== controller) return;
    if (!answer.ok) {
      if (answer.error?.code === "unauthorized") router.refresh();
      if (answer.error === undefined) return;
      return failed(answer.error.message);
    }
    const items = itemsFromAi(answer.data.items);
    if (items.length === 0) return failed(noItemsOnPhotoText);
    const rows = await review(items, controller.signal);
    if (!rows || request.current !== controller) return;
    request.current = null;
    setStage({ name: "review", rows, saving: false, error: null });
  }

  async function readText(text: string) {
    const items = parseListText(text);
    if (items.length === 0) {
      setStage({ name: "paste", text, error: noItemsInTextText });
      return;
    }
    stop();
    const controller = new AbortController();
    request.current = controller;
    const rows = await review(items, controller.signal);
    if (!rows || request.current !== controller) return;
    request.current = null;
    setStage({ name: "review", rows, saving: false, error: null });
  }

  /** Adds the ticked rows one by one, as typed items are; a failure stops there and keeps the rest to try again. */
  async function save(rows: ReviewRow[]) {
    const ticked = rows.filter((row) => row.checked);
    if (ticked.length === 0) return;
    setStage({ name: "review", rows, saving: true, error: null });
    const added: string[] = [];
    let problem: string | null = null;
    for (const row of ticked) {
      const id = crypto.randomUUID();
      // Story 23.1: an item added on this device is never news on its own badge.
      noteOwnNews(newsKey.item(id));
      let result: Result<unknown>;
      try {
        result = await addCustomItem(rowToFormInput(row, id));
      } catch {
        result = fail("shopping_save_failed");
      }
      if (!result.ok) {
        if (result.error.code === "unauthorized") router.refresh();
        problem = result.error.message;
        break;
      }
      added.push(id);
    }
    if (problem === null) {
      onClose();
      showToast(addedRowsText(added.length), { onUndo: () => void undo(added), undoLabel: "Ångra" });
      return;
    }
    // What was added is on the list: it leaves the review, and the rest can be tried again.
    const done = new Set(ticked.slice(0, added.length).map((row) => row.id));
    const left = rows.filter((row) => !done.has(row.id));
    setStage({ name: "review", rows: left, saving: false, error: added.length > 0 ? `${problem} ${addedRowsText(added.length)}` : problem });
  }

  async function undo(added: readonly string[]) {
    let failedAny = false;
    for (const id of added) {
      try {
        const result = await removeCustomItem(id);
        if (!result.ok) failedAny = true;
      } catch {
        failedAny = true;
      }
    }
    if (failedAny) showToast("Det gick inte att ångra.", { role: "alert" });
  }

  const choices = (
    <div className="-ml-2 flex flex-wrap items-center gap-x-1">
      <Button variant="compact" data-testid="list-import-photo" onClick={() => pickerRef.current?.click()}>
        <CameraIcon size={18} />
        {photoChoiceText}
      </Button>
      <Button variant="compact" data-testid="list-import-paste" onClick={() => setStage({ name: "paste", text: "", error: null })}>
        <ListIcon size={18} />
        {pasteChoiceText}
      </Button>
      {/* No `capture`: the phone offers the camera and the album in one tap (a screenshot is a photo too). */}
      <input
        ref={pickerRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="list-import-file"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void readPhoto(file);
        }}
      />
    </div>
  );
  const notice = photoError ? (
    <Notice role="alert" className="mt-1">
      {photoError}
    </Notice>
  ) : null;

  if (stage.name === "form") return { view: null, choices, notice };

  if (stage.name === "paste") {
    const text = stage.text;
    return {
      choices,
      notice,
      view: {
        title: pasteTitle,
        onBack: backToForm,
        body: (
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-paste`}>{pasteFieldLabel}</FieldLabel>
            <textarea
              id={`${ids}-paste`}
              data-testid="list-import-text"
              autoFocus
              rows={10}
              value={text}
              maxLength={maxImportTextChars}
              placeholder={"Mjölk\n2 dl grädde\n- Bröd"}
              onChange={(event) => setStage({ name: "paste", text: event.target.value, error: null })}
              className="min-h-48 w-full rounded-md border border-ink-3 bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-3"
            />
            <p className="text-meta text-ink-2">{pasteHelpText}</p>
            {stage.error ? <Notice role="alert">{stage.error}</Notice> : null}
          </div>
        ),
        footer: (
          <>
            <Button fullWidth disabled={text.trim() === ""} onClick={() => void readText(text)}>
              {pasteReadText}
            </Button>
            <Button variant="secondary" fullWidth onClick={backToForm}>
              {cancelText}
            </Button>
          </>
        ),
      },
    };
  }

  if (stage.name === "reading") {
    return {
      choices,
      notice,
      view: {
        title: reviewTitle,
        onBack: backToForm,
        body: (
          <div className="py-6">
            <AiWorking label={readingText} />
          </div>
        ),
        footer: (
          <Button variant="secondary" fullWidth onClick={backToForm}>
            {cancelText}
          </Button>
        ),
      },
    };
  }

  const { rows, saving, error } = stage;
  const count = rows.filter((row) => row.checked).length;
  const setChecked = (id: string, checked: boolean) =>
    setStage({ name: "review", rows: rows.map((row) => (row.id === id ? { ...row, checked } : row)), saving, error: null });
  return {
    choices,
    notice,
    view: {
      title: reviewTitle,
      onBack: backToForm,
      body: (
        <ul data-testid="list-import-rows" aria-label="Varor att lägga till" className="-mx-4 flex flex-col">
          {rows.map((row) => (
            <ReviewRowItem key={row.id} row={row} disabled={saving} onChecked={(checked) => setChecked(row.id, checked)} />
          ))}
        </ul>
      ),
      footer: (
        <>
          {error ? (
            <Notice role="alert" key={error}>
              {error}
            </Notice>
          ) : null}
          <Button fullWidth disabled={saving || count === 0} onClick={() => void save(rows)}>
            {saving ? "Sparar …" : addRowsText(count)}
          </Button>
          <Button variant="secondary" fullWidth disabled={saving} onClick={backToForm}>
            {cancelText}
          </Button>
        </>
      ),
    },
  };
}

function ReviewRowItem({ row, disabled, onChecked }: { row: ReviewRow; disabled: boolean; onChecked: (checked: boolean) => void }) {
  const amount = rowAmountText(row);
  return (
    <li
      data-testid="list-import-row"
      data-exists={row.exists || undefined}
      className="flex min-h-[60px] items-center gap-3 border-t border-hairline py-2 pr-1 pl-4 first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <p className={cx("text-row-title break-words", row.checked ? "text-ink" : "text-ink-2")}>{row.name}</p>
        {row.exists ? <p className="text-meta text-ink-2">{alreadyOnListText}</p> : null}
      </div>
      {amount ? <span className={cx("shrink-0 text-meta", row.checked ? "text-ink-2" : "text-ink-3")}>{amount}</span> : null}
      <Checkbox checked={row.checked} onCheckedChange={onChecked} label={`Ta med ${row.name}`} disabled={disabled} />
    </li>
  );
}
