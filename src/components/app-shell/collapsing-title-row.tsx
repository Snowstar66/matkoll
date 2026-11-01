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
export function CollapsingTitleRow({
  title,
  heading,
  actions,
  back,
}: {
  title: string;
  heading: ReactNode;
  /** The tab's buttons at the right; left out on a page under a tab. */
  actions?: ReactNode;
  /**
   * The back link above the title, on a page under a tab (Hjälp och tips, Story 20.2): like the
   * buttons it is the very same element, fixed to the bar's left while the bar shows.
   */
  back?: ReactNode;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  // The size of the buttons (and the back link) while they are in place, so their place keeps it while they are fixed to the bar.
  const [box, setBox] = useState<Box | null>(null);
  const [backBox, setBackBox] = useState<Box | null>(null);

  // Every render while the buttons are in the row (their content may change); the setters bail out when the size is the same.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (collapsed) return;
    const same = (before: Box | null, { width, height }: Box) => (before && before.width === width && before.height === height ? before : { width, height });
    if (actionsRef.current) {
      const size = actionsRef.current.getBoundingClientRect();
      setBox((before) => same(before, size));
    }
    if (backRef.current) {
      const size = backRef.current.getBoundingClientRect();
      setBackBox((before) => same(before, size));
    }
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
      {back ? (
        <div className="self-start" style={collapsed && backBox ? { width: backBox.width, height: backBox.height } : undefined}>
          {/* A flex column, so the link's own margins stay inside this box when it is measured and fixed. */}
          <div
            ref={backRef}
            className={cx(
              "flex flex-col items-start",
              collapsed && "max-desktop:fixed max-desktop:top-[calc(10px+env(safe-area-inset-top))] max-desktop:left-2 max-desktop:z-40",
            )}
          >
            {back}
          </div>
        </div>
      ) : null}
      <div ref={rowRef} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {heading}
        {actions ? (
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
        ) : null}
      </div>
    </>
  );
}
