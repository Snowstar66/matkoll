"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Set on <html> while a FixedAction is shown: its height plus the gap, so the toast can sit above it. */
export const fixedActionOffsetVar = "--fixed-action-offset";

/**
 * Fast åtgärdsknapp: one or two buttons pinned to the bottom, 12 px above the
 * tab bar on mobile and inside the iPhone safe areas. A spacer as tall as the
 * buttons keeps the end of the page from hiding behind them.
 *
 * One child fills the width. Two stand side by side in equal halves (a longer
 * label takes what it needs); when they do not fit beside each other (a long
 * label, 200 % text), they stack, with the last child on top (Story 11.4:
 * "Skicka till ICA" left, "Lägg i lagret" right, or on top). The children
 * keep their order in the DOM, so the tab order follows the row.
 */
export function FixedAction({ children }: { children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () => {
      const next = bar.getBoundingClientRect().height;
      setHeight(next);
      root.style.setProperty(fixedActionOffsetVar, `calc(${next}px + var(--fixed-action-gap))`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty(fixedActionOffsetVar);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          height:
            height === null
              ? "calc(var(--button-height) + var(--fixed-action-gap) * 2)"
              : `calc(${height}px + var(--fixed-action-gap) * 2)`,
        }}
      />
      <div className="fixed inset-x-0 bottom-[calc(var(--tab-bar-height)+var(--fixed-action-gap))] z-20 px-page desktop:bottom-[calc(env(safe-area-inset-bottom)+var(--fixed-action-gap))] desktop:left-side-menu">
        {/* wrap-reverse: the line that wraps goes above the first, so the last child ends on top. */}
        <div
          ref={barRef}
          data-testid="fixed-action"
          className="mx-auto flex max-w-content flex-wrap-reverse gap-2 *:min-w-fit *:grow *:basis-0"
        >
          {children}
        </div>
      </div>
    </>
  );
}
