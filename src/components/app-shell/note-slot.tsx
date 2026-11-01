"use client";

import { createContext, type ReactNode, useContext } from "react";

// Lappen på kylskåpet (Story 24.1): the household's notes live in the notes
// module, which shared code never imports (AD-1). The layout puts its provider
// around the shell, and the provider hands the shell what to show here: the
// card under each tab's title, the dot on the P button, and "Skriv en lapp"
// in the P sheet and the side menu.

export type ShellNote = {
  /** The note card (or the author's quiet "Väntar" line); null when there is none. */
  card: ReactNode;
  /** A note from someone else waits: the P button gets a small dot. */
  waiting: boolean;
  /** Opens "Skriv en lapp"; null when there is no one to write to (alone in the household). */
  write: (() => void) | null;
};

const ShellNoteContext = createContext<ShellNote | null>(null);

export function ShellNoteProvider({ value, children }: { value: ShellNote; children: ReactNode }) {
  return <ShellNoteContext.Provider value={value}>{children}</ShellNoteContext.Provider>;
}

/** What the notes module gives the shell; null without a provider. */
export function useShellNote(): ShellNote | null {
  return useContext(ShellNoteContext);
}

/** The note card under a tab's title (the mockup's "överst på varje flik"); nothing when there is none. */
export function NoteSlot() {
  const card = useShellNote()?.card;
  return card ? <div className="pb-4">{card}</div> : null;
}
