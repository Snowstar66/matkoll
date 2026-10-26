"use client";

import { useEffect, useState } from "react";
import { cx } from "./cx";

/** Loading shorter than this shows nothing (EXPERIENCE.md, State Patterns). */
export const skeletonDelayMs = 300;

export type SkeletonProps = {
  /** Number of card-shaped rows. */
  rows?: number;
  className?: string;
};

/**
 * Skeleton rows in the shape of the recipe cards, shown only once loading has taken
 * 300 ms. Use it as a `<Suspense>` fallback for lists; never a full-screen spinner.
 */
export function Skeleton({ rows = 3, className }: SkeletonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div role="status" className={cx("flex flex-col gap-3", className)}>
      <span className="sr-only">Laddar …</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          data-testid="skeleton-row"
          className="flex items-center gap-[14px] rounded-lg bg-surface p-3"
        >
          <div className="size-thumb shrink-0 rounded-md bg-hairline motion-safe:animate-pulse" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="h-4 w-3/4 rounded-sm bg-hairline motion-safe:animate-pulse" />
            <div className="h-3 w-1/2 rounded-sm bg-hairline motion-safe:animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
