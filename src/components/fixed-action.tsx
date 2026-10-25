"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/** Set on <html> while a FixedAction is shown: its height plus the gap, so the toast can sit above it. */
export const fixedActionOffsetVar = "--fixed-action-offset";

/**
 * Fast åtgärdsknapp: one or two full-width buttons pinned to the bottom, 12 px above
 * the tab bar on mobile and inside the iPhone safe areas. A spacer as tall as the
 * buttons keeps the end of the page from hiding behind them.
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
        <div ref={barRef} className="mx-auto flex max-w-content flex-col gap-2">
          {children}
        </div>
      </div>
    </>
  );
}
