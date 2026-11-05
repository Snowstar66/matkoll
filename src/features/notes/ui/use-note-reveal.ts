"use client";

import { useEffect, useMemo, useState } from "react";
import type { AvatarState } from "./note-avatar";

// The note performed by its avatar (Story 24.2): the words appear one at a
// time while the avatar talks (no sound), then the avatar points at the note
// for a moment and rests. Only what the eye sees: the card keeps the whole text
// for a screen reader. With "Minska rörelse" nothing is performed: all words
// are there at once and the avatar stands still.

export type NoteToken = { text: string; /** The word's number, or null for the space between words. */ word: number | null };

/** A pause for every word, and the most a long note takes in all. */
const wordMs = 170;
const maxRevealMs = 6_000;
/** How long the avatar points after the last word. */
export const pointMs = 2_800;

/** The text as words and the spaces between them (a line break stays in its space). */
export function noteTokens(text: string): NoteToken[] {
  let word = 0;
  return text
    .split(/(\s+)/)
    .filter((part) => part !== "")
    .map((part) => (/^\s+$/.test(part) ? { text: part, word: null } : { text: part, word: word++ }));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `shown` words are visible of the text's words; `state` is what the avatar
 * does: talking while words appear, pointing for pointMs, then idle.
 */
export function useNoteReveal(text: string): { tokens: NoteToken[]; shown: number; state: AvatarState } {
  const tokens = useMemo(() => noteTokens(text), [text]);
  const total = tokens.filter((token) => token.word !== null).length;
  const [still] = useState(prefersReducedMotion);
  const [shown, setShown] = useState(still ? total : 0);
  const [pointed, setPointed] = useState(false);
  const done = shown >= total;

  useEffect(() => {
    if (still || done) return;
    const every = Math.min(wordMs, maxRevealMs / Math.max(total, 1));
    const timer = setInterval(() => setShown((count) => count + 1), every);
    return () => clearInterval(timer);
  }, [still, done, total]);

  useEffect(() => {
    if (still || !done) return;
    const timer = setTimeout(() => setPointed(true), pointMs);
    return () => clearTimeout(timer);
  }, [still, done]);

  const state: AvatarState = still ? "idle" : !done ? "talking" : pointed ? "idle" : "pointing";
  return { tokens, shown: Math.min(shown, total), state };
}
