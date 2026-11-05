"use client";

import { useState } from "react";
import { cx } from "@/components/cx";
import { PenIcon } from "@/components/icons";
import { whenText } from "@/features/household";
import { avatarMoodOf, moreNotesText, type NoteAction, noteActionKey, noteActionLabel, noteText, type NoteView } from "../domain/note";
import { NoteAvatar } from "./note-avatar";
import { useNoteReveal } from "./use-note-reveal";

/** A 44 px tap area around a smaller button. */
const tapArea = "relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";

export type NoteCardProps = {
  /** The notes from someone else, newest first (at least one). */
  notes: readonly NoteView[];
  onAction: (note: NoteView, action: NoteAction) => void;
  onDone: (note: NoteView) => void;
  onReply: (note: NoteView) => void;
};

/**
 * The note on the fridge (Story 24.1; hushallet.html, "Martina får lappen"):
 * sand like a paper note, the avatar (Story 24.2) who says it word by word
 * and then points at it, name and time, the text at 17 px with the mood last,
 * the buttons as white chips, then Svara and Klar. With more notes, the newest
 * first and "1 lapp till", which shows the next.
 */
export function NoteCard({ notes, onAction, onDone, onReply }: NoteCardProps) {
  const [index, setIndex] = useState(0);
  const note = notes[Math.min(index, notes.length - 1)];
  if (!note) return null;
  // Keyed by the note, so each note is performed from its first word.
  return <NoteCardBody key={note.id} note={note} more={notes.length - 1} onNext={() => setIndex((index + 1) % notes.length)} onAction={onAction} onDone={onDone} onReply={onReply} />;
}

function NoteCardBody({
  note,
  more,
  onNext,
  onAction,
  onDone,
  onReply,
}: {
  note: NoteView;
  more: number;
  onNext: () => void;
} & Pick<NoteCardProps, "onAction" | "onDone" | "onReply">) {
  const text = noteText(note);
  const { tokens, shown, state } = useNoteReveal(text);
  return (
    <section aria-label={`Lapp från ${note.author.name}`} data-testid="note-card" className="rounded-[16px] bg-sand px-3.5 pt-3.5 pb-2 text-ink">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex size-[56px] shrink-0 items-center justify-center">
          <NoteAvatar mood={avatarMoodOf(note)} state={state} tone={note.author.tone} size={56} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] leading-5 font-semibold">{note.author.name}</span>
          <span className="text-[13px] leading-[18px] text-sand-ink">Lapp · {whenText(note.createdAt)}</span>
        </span>
        {more > 0 ? (
          <button
            type="button"
            onClick={onNext}
            className="-mr-1 min-h-tap shrink-0 rounded-md px-1 text-[14px] text-sand-ink"
            data-testid="note-more"
          >
            {moreNotesText(more)}
          </button>
        ) : null}
      </div>
      <p className="mt-2.5 text-[17px] leading-6 break-words whitespace-pre-line">
        {/* The whole text is there at once for a screen reader; the words that fade in are only for the eyes. */}
        <span className="sr-only">{text}</span>
        <span aria-hidden="true">
          {tokens.map((token, at) => (
            <span key={at} className={token.word !== null && token.word >= shown ? "opacity-0" : undefined}>
              {token.text}
            </span>
          ))}
        </span>
      </p>
      {note.actions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {note.actions.map((action) => (
            <button
              key={noteActionKey(action)}
              type="button"
              onClick={() => onAction(note, action)}
              className={cx(
                "inline-flex h-8 max-w-full items-center rounded-pill bg-surface px-3.5 text-[15px] font-medium whitespace-nowrap text-accent",
                tapArea,
              )}
            >
              <span className="truncate">{noteActionLabel(action)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-1 flex items-center justify-between">
        <button type="button" onClick={() => onReply(note)} className="-ml-1 min-h-tap rounded-md px-1 text-[15px] font-medium text-accent">
          Svara
        </button>
        <button
          type="button"
          onClick={() => onDone(note)}
          className={cx("inline-flex h-9 items-center rounded-[10px] bg-accent px-4 text-[15px] font-semibold text-on-accent", tapArea)}
        >
          Klar
        </button>
      </div>
    </section>
  );
}

/**
 * The author's own note, quieter, with "Väntar" until someone presses Klar
 * (hushallet.html, section 6), and "Ta bort" so the author can take it back.
 */
export function OwnNoteLine({ note, onRemove }: { note: NoteView; onRemove: (note: NoteView) => void }) {
  return (
    <div data-testid="own-note" className="flex min-h-11 items-center gap-2.5 rounded-[12px] bg-sand px-3.5 py-2 text-[15px] leading-5 text-ink">
      <PenIcon size={18} className="shrink-0 text-sand-ink" />
      <span className="min-w-0 flex-1 truncate">
        <span className="sr-only">Din lapp: </span>
        {noteText(note)}
      </span>
      <span className="shrink-0 text-[13px] leading-[18px] text-sand-ink">Väntar</span>
      <button
        type="button"
        onClick={() => onRemove(note)}
        className={cx("-mr-1 shrink-0 rounded-md px-1 text-[13px] leading-[18px] font-medium text-danger", tapArea)}
      >
        Ta bort
      </button>
    </div>
  );
}
