"use client";

import { Children, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./cx";

/** Set on <html> while a FixedAction is pinned: its height plus the gap, so the toast can sit above it. */
export const fixedActionOffsetVar = "--fixed-action-offset";

/** A pinned bar taller than this share of the viewport (large text, a short window) stands at the end of the page instead. */
export const inlineShare = 0.25;
/** It is pinned again below this share, so it does not flip back and forth at the limit. */
const pinShare = 0.22;

/** The width an element needs on one line: its max-content width, read without a paint in between. */
function oneLineWidth(element: HTMLElement): number {
  const { width, flex, maxWidth, minWidth } = element.style;
  element.style.width = "max-content";
  element.style.flex = "none";
  element.style.maxWidth = "none";
  element.style.minWidth = "0";
  const needed = element.getBoundingClientRect().width;
  Object.assign(element.style, { width, flex, maxWidth, minWidth });
  return needed;
}

type Layout = {
  /** The bar's height, `null` before it is measured. */
  height: number | null;
  /** The buttons do not fit beside each other: one above the other, the last child on top. */
  stacked: boolean;
  /** The bar stands at the end of the page instead of pinned (inlineShare). */
  inline: boolean;
  /** Room kept below the page for buttons that are not shown yet (`reserve`). */
  extra: number;
};

export type FixedActionProps = {
  children: ReactNode;
  /**
   * How many buttons to keep room for below the page, e.g. 2 when a second
   * button can appear: then the end of the page does not move when it does,
   * also when the two would stand one above the other.
   */
  reserve?: number;
  /** On the same glass as the tab bar, flush above it (Story 19.6: the recipe view). */
  glass?: boolean;
};

/**
 * Fast åtgärdsknapp: one or two buttons pinned to the bottom, 12 px above the
 * tab bar on mobile and inside the iPhone safe areas. A spacer as tall as the
 * buttons keeps the end of the page from hiding behind them, and
 * `scroll-padding-bottom` on the page keeps a focused element above them.
 *
 * One child fills the width. Two stand side by side, in equal halves when
 * they fit (a longer label takes what it needs). When their labels do not fit
 * on one line beside each other (a long label, 200 % text), they stand one
 * above the other with the last child on top, and first in the DOM too, so
 * the reading and tab order follow what is seen (Story 11.4: "Skicka till
 * ICA" left and "Lägg till i Matvaror" right, or "Lägg till i Matvaror" on top). A label
 * wraps inside its button rather than overflow. When the pinned bar would
 * take more than a quarter of the viewport, it stands at the end of the page
 * instead.
 */
export function FixedAction({ children, reserve = 1, glass = false }: FixedActionProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({ height: null, stacked: false, inline: false, extra: 0 });
  const items = Children.toArray(children);
  const count = items.length;

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const measure = () => {
      const kids = [...bar.children] as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(bar).columnGap) || 0;
      const widths = kids.map(oneLineWidth);
      const stacked = kids.length > 1 && widths.reduce((sum, width) => sum + width, 0) + gap * (kids.length - 1) > bar.clientWidth;
      const box = bar.getBoundingClientRect();
      const viewport = window.innerHeight;
      setLayout((before) => {
        const inline = viewport > 0 && box.height > viewport * (before.inline ? pinShare : inlineShare);
        // A second button would not fit beside the one shown: keep a row for it.
        const wouldStack = kids.length === 1 && reserve > 1 && (widths[0] ?? 0) > (bar.clientWidth - gap) / 2;
        const rowHeight = (kids[0]?.getBoundingClientRect().height ?? 0) + gap;
        const extra = !inline && (stacked || wouldStack) ? Math.max(0, reserve - kids.length) * rowHeight : 0;
        const next = { height: box.height, stacked, inline, extra };
        return Object.entries(next).every(([key, value]) => before[key as keyof Layout] === value) ? before : next;
      });
      if (layout.inline) {
        root.style.removeProperty(fixedActionOffsetVar);
        root.style.removeProperty("scroll-padding-bottom");
      } else {
        root.style.setProperty(fixedActionOffsetVar, `calc(${box.height}px + var(--fixed-action-gap))`);
        // Everything from the bar's top down, the tab bar included, plus the gap.
        if (viewport > 0 && box.height > 0) root.style.setProperty("scroll-padding-bottom", `calc(${viewport - box.top}px + var(--fixed-action-gap))`);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty(fixedActionOffsetVar);
      root.style.removeProperty("scroll-padding-bottom");
    };
  }, [layout.inline, reserve, count]);

  const bar = (
    <div
      ref={barRef}
      data-testid="fixed-action"
      data-layout={layout.stacked ? "stacked" : "row"}
      className={cx(
        "mx-auto flex max-w-content gap-2 *:max-w-full",
        // A label wraps inside its button rather than overflow.
        "[&>button]:h-auto [&>button]:min-h-button [&>button]:py-2 [&>button]:text-center [&>button]:whitespace-normal",
        layout.stacked ? "flex-col" : "flex-row *:min-w-fit *:grow *:basis-0",
      )}
    >
      {layout.stacked ? [...items].reverse() : items}
    </div>
  );

  // The same elements pinned and inline, only other classes: a switch (the
  // first measure after hydration, a turned phone, larger text) keeps the
  // buttons' DOM nodes, their state and their focus.
  return (
    <>
      {layout.inline ? null : (
        <div
          aria-hidden="true"
          // On a desktop the bar stands above the safe area, so the spacer clears that too.
          className="desktop:mb-[env(safe-area-inset-bottom)]"
          style={{
            height:
              layout.height === null
                ? "calc(var(--button-height) + var(--fixed-action-gap) * 2)"
                : `calc(${layout.height + layout.extra}px + var(--fixed-action-gap) * 2)`,
          }}
        />
      )}
      <div
        data-fixed-action-inline={layout.inline ? "true" : undefined}
        className={
          layout.inline
            ? "mt-2"
            : cx(
                "fixed inset-x-0 z-20 px-page desktop:left-side-menu",
                glass
                  ? "bottom-[var(--tab-bar-height)] border-t-[0.5px] border-border bg-bar py-2 backdrop-blur-[20px] backdrop-saturate-150 desktop:bottom-0"
                  : "bottom-[calc(var(--tab-bar-height)+var(--fixed-action-gap))] desktop:bottom-[calc(env(safe-area-inset-bottom)+var(--fixed-action-gap))]",
              )
        }
      >
        {bar}
      </div>
    </>
  );
}
