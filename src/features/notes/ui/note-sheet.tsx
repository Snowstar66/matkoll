"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { cx } from "@/components/cx";
import { Sheet } from "@/components/sheet";
import { noteRecipeTitles, sendNote } from "../actions/notes";
import {
  maxNoteChars,
  noteActionKey,
  noteActionLabel,
  type NoteMood,
  noteMoods,
  noteText,
  type NoteView,
  quickReplies,
  type RecipeTitle,
  replySheetTitle,
  suggestNoteActions,
} from "../domain/note";

/** Write a note, or answer one. */
export type NoteSheetMode = { kind: "write"; title: string } | { kind: "reply"; note: NoteView };

export type NoteSheetProps = {
  /** The sheet to show, or null when none is open. */
  mode: NoteSheetMode | null;
  onClose: () => void;
  /** After Skicka went through: the sheet closes and the board is read again. */
  onSent: (mode: NoteSheetMode) => void;
};

/** The field as in Tyck till (Story 20.3): several lines, 17 px, a 2 px accent line when focused. */
const textareaClasses = cx(
  "block w-full resize-none rounded-md border border-border bg-surface px-3.5 py-3 text-[17px] leading-6 text-ink [field-sizing:content] placeholder:text-ink-3",
  "max-h-[40dvh] outline-none focus:border-2 focus:border-accent focus:px-[13px] focus:py-[11px] dark:border-transparent dark:bg-fill dark:focus:border-accent",
);

/**
 * Skriv en lapp and Svara (Story 24.1; hushallet.html, "Pontus skriver" and
 * "Martina svarar"): the title says to whom, Avbryt at the top right, the
 * field has focus. Svara quotes the note and offers three quick replies that
 * fill the field. An optional mood of five emoji. The buttons the text
 * suggests (a recipe it names, Visa listan when it speaks of shopping) are
 * chosen chips; a tap leaves one out. Skicka is dimmed until there is text.
 */
export function NoteSheet({ mode, onClose, onSent }: NoteSheetProps) {
  const ids = useId();
  const [openedAs, setOpenedAs] = useState<NoteSheetMode | null>(null);
  const [shown, setShown] = useState<NoteSheetMode | null>(null);
  const [text, setText] = useState("");
  const [mood, setMood] = useState<NoteMood | null>(null);
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<readonly RecipeTitle[] | null>(null);

  // A new sheet each time it opens (the React way to reset state on a prop change).
  if (mode !== openedAs) {
    setOpenedAs(mode);
    if (mode) {
      setShown(mode);
      setText("");
      setMood(null);
      setLeft(new Set());
      setSending(false);
      setError(null);
    }
  }

  // The household's recipe titles, read once when a sheet first opens.
  const open = mode !== null;
  useEffect(() => {
    if (!open || recipes !== null) return;
    let live = true;
    noteRecipeTitles().then(
      (titles) => {
        if (live) setRecipes(titles);
      },
      () => {
        if (live) setRecipes([]);
      },
    );
    return () => {
      live = false;
    };
  }, [open, recipes]);

  const suggested = useMemo(() => suggestNoteActions(text, recipes ?? []), [text, recipes]);
  const chosen = suggested.filter((action) => !left.has(noteActionKey(action)));
  const body = text.trim();
  const canSend = body.length > 0 && !sending;
  const replyTo = shown?.kind === "reply" ? shown.note : null;
  const title = shown ? (shown.kind === "write" ? shown.title : replySheetTitle(shown.note.author.name)) : "";

  async function send() {
    if (!shown || !canSend) return;
    setSending(true);
    setError(null);
    const result = await sendNote({ text: body, mood, actions: chosen, replyTo: replyTo?.id ?? null });
    if (result.ok) {
      onSent(shown);
    } else {
      setSending(false);
      setError(result.error.message);
    }
  }

  function toggle(key: string) {
    const next = new Set(left);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setLeft(next);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      closeLabel="Avbryt"
      isDirty={body.length > 0}
      preventClose={sending}
      footer={
        <>
          {error ? (
            <p role="alert" className="text-meta text-sky-ink">
              {error}
            </p>
          ) : null}
          <Button fullWidth disabled={!canSend} onClick={send} className="disabled:opacity-40" data-testid="note-send">
            {sending ? "Skickar …" : "Skicka"}
          </Button>
        </>
      }
    >
      <div className="pb-1">
        {replyTo ? (
          <p className="mt-1 rounded-[12px] bg-bg px-3 py-2.5 text-[15px] leading-[21px] text-ink-2 dark:bg-fill">
            <b className="font-semibold text-ink">{replyTo.author.name}:</b> {noteText(replyTo)}
          </p>
        ) : null}
        <textarea
          id={`${ids}-text`}
          aria-label={replyTo ? "Svar" : "Lapp"}
          // The field has focus as the sheet opens (the mockup's caret): writing is why it was opened.
          autoFocus
          value={text}
          maxLength={maxNoteChars}
          placeholder={replyTo ? "Skriv ett svar" : "Skriv en lapp"}
          onChange={(event) => setText(event.target.value)}
          className={cx(textareaClasses, replyTo ? "mt-3 min-h-20" : "mt-1 min-h-24")}
        />
        {replyTo ? (
          <div role="group" aria-label="Snabbsvar" className="mt-3 flex flex-wrap gap-2">
            {quickReplies.map((reply) => (
              <Chip key={reply} selected={body === reply} aria-pressed={body === reply} onClick={() => setText(reply)}>
                {reply}
              </Chip>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <p id={`${ids}-mood`} className="flex flex-wrap items-baseline gap-x-1.5 text-[15px] leading-5 font-medium text-ink">
            Humör <span className="font-normal text-ink-2">(valfritt)</span>
          </p>
          <div role="group" aria-labelledby={`${ids}-mood`} className="flex gap-2">
            {noteMoods.map((candidate) => {
              const on = mood === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={candidate.label}
                  onClick={() => setMood(on ? null : candidate.id)}
                  className={cx(
                    "flex size-11 items-center justify-center rounded-full text-[22px] leading-none select-none",
                    on ? "border-2 border-accent bg-mint" : "border border-border bg-surface dark:border-transparent dark:bg-fill",
                  )}
                >
                  <span aria-hidden="true">{candidate.emoji}</span>
                </button>
              );
            })}
          </div>
        </div>
        {suggested.length > 0 ? (
          <div className="mt-4 flex flex-col gap-2">
            <p id={`${ids}-actions`} className="text-[15px] leading-5 font-medium text-ink">
              Knappar på lappen
            </p>
            <div role="group" aria-labelledby={`${ids}-actions`} className="flex flex-wrap gap-2" data-testid="note-actions">
              {suggested.map((action) => {
                const key = noteActionKey(action);
                const on = !left.has(key);
                return (
                  <Chip key={key} selected={on} aria-pressed={on} icon={on ? "✓" : undefined} onClick={() => toggle(key)}>
                    {noteActionLabel(action)}
                  </Chip>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
