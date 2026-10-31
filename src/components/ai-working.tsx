"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cx } from "./cx";

// "Väntan på AI" (Story 16.15, demo ai-vanta.html, style B and A together): a
// small glowing orb and a shimmering text that steps through a few short
// phrases about every 2.2 s and stays on the last one (it never loops, so it
// never looks like it starts over). Used wherever the app waits on AI; not for
// skeletons, saving or the site switch.

/** Playful words for a call that has nothing specific to say (in the spirit of Claude Code's spinner verbs). */
export const playfulWords: readonly string[] = [
  "Funderar …",
  "Klurar …",
  "Grubblar …",
  "Knåpar …",
  "Pusslar …",
  "Filurerar …",
  "Smågrubblar …",
  "Lägger pussel …",
  "Rotar runt …",
];

/** Two or three distinct playful words, in random order; `random` is injectable for tests. */
export function pickPlayfulSteps(random: () => number = Math.random, count = random() < 0.5 ? 2 : 3): string[] {
  const pool = [...playfulWords];
  const picked: string[] = [];
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.min(pool.length - 1, Math.floor(random() * pool.length)), 1)[0]);
  }
  return picked;
}

/** How long each step stays, in milliseconds. */
export const aiStepMs = 2200;

const reducedQuery = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const list = window.matchMedia(reducedQuery);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === "function" && window.matchMedia(reducedQuery).matches,
    () => false,
  );
}

export function AiWorking({
  steps,
  label,
  random,
  size = "md",
  inLiveRegion = false,
  className,
}: {
  /** Two or three short phrases; the first is what a screen reader hears. Without them, playful words are picked once on mount. */
  steps?: readonly string[];
  /** For tests: the source of the random pick of playful words. */
  random?: () => number;
  /** One fixed phrase instead of steps. */
  label?: string;
  /** "sm" in a chat bubble or a row, "md" on its own. */
  size?: "sm" | "md";
  /** The caller already has a live region around this (the region must exist before the text); then this adds no role of its own. */
  inLiveRegion?: boolean;
  className?: string;
}) {
  const [playful] = useState(() => pickPlayfulSteps(random));
  const list = label ? [label] : steps && steps.length > 0 ? steps : playful;
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const last = list.length - 1;
  useEffect(() => {
    if (reduced || index >= last) return;
    const id = window.setTimeout(() => setIndex((i) => i + 1), aiStepMs);
    return () => window.clearTimeout(id);
  }, [index, last, reduced]);
  const shown = reduced ? list[0] : list[Math.min(index, last)];
  return (
    <div
      role={inLiveRegion ? undefined : "status"}
      data-testid="ai-working"
      className={cx("flex items-center gap-2.5 text-body text-ink-2", size === "sm" && "text-meta", className)}
    >
      <span aria-hidden="true" className="ai-orb" style={{ ["--ai-orb-size" as string]: size === "sm" ? "18px" : "26px" }} />
      <span className="sr-only">{list[0]}</span>
      <span key={shown} aria-hidden="true" data-testid="ai-working-text" className="ai-shimmer motion-safe:animate-step-in">
        {shown}
      </span>
    </div>
  );
}

/** The orb alone, for a row that already has its own text (the job row). */
export function AiOrb({ size = 14, className }: { size?: number; className?: string }) {
  return <span aria-hidden="true" className={cx("ai-orb", className)} style={{ ["--ai-orb-size" as string]: `${size}px` }} />;
}
