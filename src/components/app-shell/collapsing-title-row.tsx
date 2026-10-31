"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../cx";

/** The slim bar's height (Story 19.2): 52 px, the first 4 of them air, below the notch on the home screen. */
const barHeightPx = 52;

type Box = { width: number; height: number };

/**
 * The title row of a tab's header (Story 19.2): the large title with the tab's
 * buttons at the right and, once the title has scrolled out of sight, a slim
 * bar (52 px, 84 % surface with blur and a hairline below) with the title
 * centred and the same buttons at the right. The buttons are the very same
 * elements: they stay where they are and are fixed to the bar when it shows
 * (their old place keeps its size), so there is one "+" and one P at any time.
 * Only the bar fades in (150 ms); the text never changes size, which works the
 * same with "Minska rörelse". From 1024 px the side menu holds the account and
 * the bar and the fixing are off.
 */
export function CollapsingTitleRow({ title, heading, actions }: { title: string; heading: ReactNode; actions: ReactNode }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  // The size of the buttons while they are in the row, so their place keeps it while they are fixed to the bar.
  const [box, setBox] = useState<Box | null>(null);

  useLayoutEffect(() => {
    if (collapsed || !actionsRef.current) return;
    const { width, height } = actionsRef.current.getBoundingClientRect();
    setBox((before) => (before && before.width === width && before.height === height ? before : { width, height }));
    // Every render while the buttons are in the row (their content may change); setBox bails out when the size is the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof IntersectionObserver === "undefined") return;
    const bar = barRef.current?.offsetHeight || barHeightPx;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setCollapsed(!entry.isIntersecting && entry.boundingClientRect.bottom <= bar + 1);
      },
      { rootMargin: `-${bar}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={barRef}
        aria-hidden="true"
        data-testid="collapsed-bar"
        data-shown={collapsed || undefined}
        className={cx(
          "pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-center border-b-[0.5px] border-border bg-bar px-24 pt-[calc(4px+env(safe-area-inset-top))] backdrop-blur-[20px] backdrop-saturate-150",
          "h-[calc(52px+env(safe-area-inset-top))] transition-opacity duration-150 desktop:hidden",
          collapsed ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="truncate text-headline text-ink">{title}</p>
      </div>
      <div ref={rowRef} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {heading}
        <div
          className="ml-auto shrink-0"
          style={collapsed && box ? { width: box.width, height: box.height } : undefined}
        >
          <div
            ref={actionsRef}
            className={cx(
              "flex items-center gap-1 max-desktop:-mr-1.5",
              collapsed && "max-desktop:fixed max-desktop:top-[calc(4px+env(safe-area-inset-top))] max-desktop:right-2 max-desktop:mr-0 max-desktop:z-40",
            )}
          >
            {actions}
          </div>
        </div>
      </div>
    </>
  );
}
