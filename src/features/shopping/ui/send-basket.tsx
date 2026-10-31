"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import type { Store } from "@/features/settings";
import type { ShoppingLine } from "../domain/compute-list";
import { basketItemCount, exportableLines, exportBasket } from "../domain/export-basket";
import {
  copiedText,
  copyFailedText,
  copyText,
  exportSheetTitle,
  exportTextLabel,
  listCopiedText,
} from "../domain/list-text";
import { shareListText, weekNumberOfPlan } from "../domain/share-list";
import type { ProductChoice } from "../domain/product-choice";
import { stepsHidden } from "./steps-sheet";

// "Kopiera till ICA-varukorgen" (FR-26, AD-16, Story 7.3, 14.2): copies the basket export to
// the clipboard for Pontus's own Claude in Chrome. The text is built here,
// from the list as it is shown (a check not yet saved included), and
// navigator.clipboard.writeText is called in the same tap, with no await,
// fetch or Server Action before it, so the browser counts it as the user's
// action. Nothing goes to the server, nothing is stored, and no store's site
// is opened (the steps sheet has a link Pontus taps himself). When the browser refuses the clipboard, the sheet Inköpslistan
// shows the text selected, with "Kopiera".

/** What the list has when the button is tapped. */
export type SendBasketInput = {
  /** The list's lines as shown, with checks not yet saved. */
  lines: readonly ShoppingLine[];
  /** The selected store as the list was read; `null` when none is selected. */
  store: Store | null;
  /** The store could not be read. */
  storeUnavailable: boolean;
  /** The store's product choices by catalog ingredient id. */
  productChoices: Readonly<Record<string, ProductChoice>>;
  /** The choices could not be read: the export is copied without them, and the confirmation says so. */
  productChoicesUnavailable: boolean;
  /** The catalog ingredients whose stored choice cannot be read: an export with one of them says "utan alla produktval". */
  unreadableChoices: readonly string[];
  /** The checks could not be read: every line is sent, and the confirmation says to check the basket. */
  checksUnavailable: boolean;
  /** The plan's name ("Vecka 44"), for the week in the shared text's heading; `null` without a plan. */
  planName?: string | null;
};

/** The sheet Inköpslistan: the text, and how many times "Kopiera" was refused in it. */
export type ExportSheetState = {
  open: boolean;
  /** A new session per opening, so the field is selected again. */
  session: number;
  text: string;
  /** The short confirmation once a copy from the sheet works. */
  confirmation: string;
  /** How many times "Kopiera" was refused; from 1, the sheet says so and selects the text again. */
  refused: number;
};

/** No product choices: when they could not be read. */
const noChoices: Readonly<Record<string, ProductChoice>> = {};

/**
 * Writes `text` to the clipboard, calling writeText right away: a promise of
 * whether it worked, or `false` at once when the browser has no clipboard.
 */
function writeToClipboard(text: string): Promise<boolean> | false {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (typeof clipboard?.writeText !== "function") return false;
  try {
    return clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  } catch {
    return false;
  }
}

/**
 * `send` for the button: builds the export of the lines not checked off and
 * vague ones included, in the selected store with its choices, and copies it, then
 * shows the short confirmation (which says what is missing); when the
 * clipboard is refused or missing, the sheet with the text. Only the latest
 * tap's answer counts: an older writeText that settles later is ignored.
 * Without a store nothing is copied, and `storeNotice` is set (a new id per
 * tap, so the notice is announced again) until the store can be read or the
 * list is hidden.
 */
export function useSendBasket({
  lines,
  store,
  storeUnavailable,
  productChoices,
  productChoicesUnavailable,
  unreadableChoices,
  checksUnavailable,
  planName,
}: SendBasketInput) {
  const { showToast } = useToast();
  const [sheet, setSheet] = useState<ExportSheetState | null>(null);
  const [storeNotice, setStoreNotice] = useState<number | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const storeMissing = storeUnavailable || store === null;
  /** The latest tap; a writeText answer for an earlier one is ignored. */
  const sendToken = useRef(0);
  /** The sheet session that is open, or `null`; a "Kopiera" answer for another is ignored. */
  const openSession = useRef<number | null>(null);

  // The notice belongs to what Pontus just did: it goes when the list is hidden.
  useEffect(() => () => setStoreNotice(null), []);
  // It also goes once the store can be read again: the state is reset while
  // rendering (React's pattern for state that follows a prop; the lint rule
  // refuses a setState in an effect body), so a later missing store starts
  // without it.
  if (!storeMissing && storeNotice !== null) setStoreNotice(null);

  /** The sheet's sessions so far. */
  const sessions = useRef(0);

  function openSheet(text: string, confirmation: string) {
    sessions.current += 1;
    openSession.current = sessions.current;
    setSheet({ open: true, session: sessions.current, text, confirmation, refused: 0 });
  }

  function send() {
    sendToken.current += 1;
    const token = sendToken.current;
    if (storeMissing || store === null) {
      setStoreNotice((before) => (before ?? 0) + 1);
      return;
    }
    setStoreNotice(null);
    const sent = exportableLines(lines);
    const text = exportBasket(sent, store, productChoicesUnavailable ? noChoices : productChoices);
    const confirmation = copiedText(store, {
      withoutChoices: productChoicesUnavailable,
      partialChoices: sent.some((line) => line.ingredientId !== undefined && unreadableChoices.includes(line.ingredientId)),
      checksUnread: checksUnavailable,
      count: basketItemCount(sent),
    });
    const written = writeToClipboard(text);
    if (written === false) {
      openSheet(text, confirmation);
      return;
    }
    void written.then((copied) => {
      if (token !== sendToken.current) return;
      if (copied) {
        showToast(confirmation);
        if (!stepsHidden()) setStepsOpen(true);
      } else openSheet(text, confirmation);
    });
  }

  /** "Kopiera" in the sheet: tries the clipboard again in the same tap; only the open session's answer counts. */
  function copyAgain() {
    if (!sheet?.open) return;
    const { text, confirmation, session } = sheet;
    const written = writeToClipboard(text);
    const done = (copied: boolean) => {
      if (openSession.current !== session) return;
      if (copied) {
        openSession.current = null;
        setSheet((current) => (current?.session === session ? { ...current, open: false } : current));
        showToast(confirmation);
      } else {
        setSheet((current) => (current?.session === session ? { ...current, refused: current.refused + 1 } : current));
      }
    };
    if (written === false) done(false);
    else void written.then(done);
  }

  function closeSheet() {
    openSession.current = null;
    setSheet((current) => (current ? { ...current, open: false } : current));
  }

  /** "Dela listan": the unchecked lines as plain text, by the phone's share menu, or copied when there is none. */
  function share() {
    const text = shareListText(lines, weekNumberOfPlan(planName ?? undefined));
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      // A cancelled share menu rejects: that is not an error.
      navigator.share({ text }).catch(() => {});
      return;
    }
    const written = writeToClipboard(text);
    if (written === false) {
      openSheet(text, listCopiedText);
      return;
    }
    void written.then((copied) => {
      if (copied) showToast(listCopiedText);
      else openSheet(text, listCopiedText);
    });
  }

  return {
    send,
    share,
    storeNotice,
    sheet,
    copyAgain,
    closeSheet,
    stepsOpen,
    showSteps: () => setStepsOpen(true),
    closeSteps: () => setStepsOpen(false),
  };
}

/** Selects all of the field's text and gives it focus, also on iOS Safari. */
function selectAll(field: HTMLTextAreaElement | null) {
  if (!field) return;
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);
}

/**
 * Inköpslistan: the export in a read-only field (16 px text), all of it
 * selected and focused when the sheet opens, "Kopiera" (primary) to try the
 * clipboard again and "Klar" to close. When "Kopiera" is refused again, the
 * text is selected again and a line under the field says to copy it by hand.
 */
export function ExportSheet({
  state,
  onCopy,
  onClose,
}: {
  state: ExportSheetState;
  onCopy: () => void;
  onClose: () => void;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const failedId = useId();
  const { open, session, refused } = state;

  // Runs after the Sheet has opened its dialog (a child's effect runs first), so focus can move into it.
  useEffect(() => {
    if (open) selectAll(fieldRef.current);
  }, [open, session, refused]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exportSheetTitle}
      footer={
        <Button fullWidth onClick={onCopy}>
          {copyText}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <textarea
          ref={fieldRef}
          readOnly
          aria-label={exportTextLabel}
          aria-describedby={refused > 0 ? failedId : undefined}
          // iOS Safari may ignore a select() from code: a tap on the field selects all of it.
          onClick={(event) => selectAll(event.currentTarget)}
          value={state.text}
          rows={12}
          spellCheck={false}
          className="min-h-48 w-full rounded-md border border-ink-3 bg-surface px-4 py-3 text-body break-words whitespace-pre-wrap text-ink"
        />
        {refused > 0 ? (
          // A new element per refusal, so it is announced again.
          <p key={refused} id={failedId} role="alert" className="text-meta text-sky-ink">
            {copyFailedText}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
