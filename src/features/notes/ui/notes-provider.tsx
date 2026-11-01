"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { ShellNoteProvider } from "@/components/app-shell/note-slot";
import { useToast } from "@/components/toast";
import { useLiveRefresh } from "@/components/use-live-refresh";
import type { Result } from "@/lib/errors";
import { setNoteDone } from "../actions/notes";
import { emptyNoteBoard, type NoteAction, type NoteBoard, noteSheetTitle, type NoteView, splitNotes } from "../domain/note";
import { NoteCard, OwnNoteLine } from "./note-card";
import { NoteSheet, type NoteSheetMode } from "./note-sheet";

/** Lägg på matsedeln: mealplan's Server Action, given by the layout (a module never imports another's actions, AD-1). */
export type AddToPlan = (input: { recipeId: string; id?: string }) => Promise<Result<unknown>>;

/** The board as GET /api/notes gives it, or null when it could not be read. */
async function readBoard(): Promise<NoteBoard | null> {
  try {
    const response = await fetch("/api/notes", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok: boolean; data?: NoteBoard };
    return body.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

/**
 * Lappen på kylskåpet (Story 24.1): reads the household's open notes when the
 * app starts and then on the live pace of Story 17.12 (every 10 s while the tab
 * is seen, at once when it is shown again), and gives the shell the card for
 * the top of each tab, the dot on the P button and "Skriv en lapp". Klar takes
 * a note away for everyone at once ("Lappen är klar." with Ångra); the buttons
 * put a recipe on this week's meal plan or open Inköpslista.
 */
export function NotesProvider({ addToPlan, children }: { addToPlan: AddToPlan; children: ReactNode }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [board, setBoard] = useState<NoteBoard>(emptyNoteBoard);
  /** Notes marked Klar on this device, hidden until a read no longer has them (or Ångra). */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(0);
  const [sheet, setSheet] = useState<NoteSheetMode | null>(null);

  const load = useCallback(async () => {
    const next = await readBoard();
    if (next) setBoard(next);
  }, []);

  useEffect(() => {
    // The first read as the app starts; then the live pace below.
    let live = true;
    void readBoard().then((next) => {
      if (live && next) setBoard(next);
    });
    return () => {
      live = false;
    };
  }, []);
  useLiveRefresh({ busy: busy > 0, refresh: load });

  const hide = useCallback((id: string, on: boolean) => {
    setHidden((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const done = useCallback(
    async (note: NoteView) => {
      hide(note.id, true);
      setBusy((count) => count + 1);
      const result = await setNoteDone(note.id, true);
      setBusy((count) => count - 1);
      if (!result.ok && result.error.code !== "note_gone") {
        hide(note.id, false);
        showToast(result.error.message, { role: "alert" });
        return;
      }
      showToast("Lappen är klar.", {
        onUndo: async () => {
          const undone = await setNoteDone(note.id, false);
          if (!undone.ok) {
            showToast("Det gick inte att ångra.", { role: "alert" });
            return;
          }
          hide(note.id, false);
          await load();
        },
      });
    },
    [hide, load, showToast],
  );

  const act = useCallback(
    async (_note: NoteView, action: NoteAction) => {
      if (action.kind === "list") {
        router.push("/lista");
        return;
      }
      const result = await addToPlan({ recipeId: action.recipeId, id: crypto.randomUUID() });
      if (result.ok) {
        showToast(`Lade ${action.title} på matsedeln.`, { show: { label: "Visa", onShow: () => router.push("/matsedel") } });
      } else {
        showToast(result.error.message, { role: "alert" });
      }
    },
    [addToPlan, router, showToast],
  );

  const visible = useMemo(() => board.notes.filter((note) => !hidden.has(note.id)), [board.notes, hidden]);
  const { received, ownNewest } = splitNotes(visible);
  const others = board.others;

  const write = useCallback(() => setSheet({ kind: "write", title: noteSheetTitle(others) }), [others]);
  const reply = useCallback((note: NoteView) => setSheet({ kind: "reply", note }), []);

  const card =
    received.length > 0 ? (
      <NoteCard notes={received} onAction={act} onDone={done} onReply={reply} />
    ) : ownNewest ? (
      <OwnNoteLine note={ownNewest} />
    ) : null;

  const value = { card, waiting: received.length > 0, write: others.length > 0 ? write : null };

  return (
    <ShellNoteProvider value={value}>
      {children}
      <NoteSheet
        mode={sheet}
        onClose={() => setSheet(null)}
        onSent={(mode) => {
          setSheet(null);
          showToast(mode.kind === "reply" ? "Svaret är skickat." : "Lappen är skickad.");
          void load();
        }}
      />
    </ShellNoteProvider>
  );
}
