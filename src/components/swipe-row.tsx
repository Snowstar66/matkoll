"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cx } from "./cx";

/** How wide the revealed action is; the row slides this far to the left. */
export const swipeActionWidthPx = 96;
/** A swipe that ends further left than this opens the row; a shorter one slides back. */
export const swipeOpenThresholdPx = swipeActionWidthPx / 2;
/** How far the pointer must move before the row decides between a swipe and a scroll. */
export const swipeSlopPx = 8;
/** A click this soon after a swipe ended belongs to the swipe, not to the row. */
const clickAfterSwipeMs = 600;
/** What in the row can take focus back from the action; never something taken out of the tab order. */
const rowFocusTarget = ["a[href]", "button:not([disabled])", "input", "select", "textarea", "[tabindex]"]
  .map((selector) => `${selector}:not([tabindex="-1"])`)
  .join(", ");

export type SwipeRowProps = {
  /** The row itself, usually a button that opens the item. */
  children: ReactNode;
  /** The action's visible text: "Ta bort". */
  actionLabel: string;
  /** The action's name for screen readers, with the item: "Ta bort Mjölk". */
  actionName: string;
  /** Runs the action; `via` says whether a key or a pointer pressed it, e.g. to move focus afterwards. */
  onAction: (via: "keyboard" | "pointer") => void;
  className?: string;
};

type Drag = {
  pointerId: number;
  startX: number;
  startY: number;
  /** The row's offset when the pointer went down. */
  base: number;
  /** Unknown until the pointer has moved `swipeSlopPx`; a vertical move is left to the page's scroll. */
  axis: "x" | "y" | null;
};

/**
 * Svep vänster (EXPERIENCE.md, Interaction Primitives; UX-DR13): swiping the
 * row to the left, with a finger or a mouse, reveals one action to its right,
 * e.g. "Ta bort"; a tap on it runs the action. A swipe past half the action's
 * width opens the row, a shorter one slides back. The swipe is a shortcut,
 * so the same action must be elsewhere too (the item's sheet).
 *
 * The action is a real button after the row in the tab order, named for
 * screen readers (`actionName`): focusing it opens the row, so it is reached
 * without a swipe; leaving it closes the row, and Esc closes it with focus
 * back on the row. A tap on an open row, or
 * anywhere outside it, closes it instead of opening the item. Vertical moves
 * scroll the page as usual. With "Minska rörelse" the row moves without
 * animation.
 */
export function SwipeRow({ children, actionLabel, actionName, onAction, className }: SwipeRowProps) {
  const [open, setOpen] = useState(false);
  /** The offset while the pointer drags the row; null when it rests open or closed. */
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const swipeEndedAt = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const offset = dragOffset ?? (open ? -swipeActionWidthPx : 0);

  // An open row closes when Pontus touches anything else.
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node | null)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  /** Stops following the pointer; the row rests where it was. */
  function abortDrag() {
    drag.current = null;
    setDragOffset(null);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // One pointer at a time: a second finger, or another mouse button, is not a swipe.
    if (!event.isPrimary || drag.current) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipeEndedAt.current = null;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, base: offset, axis: null };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId || current.axis === "y") return;
    // The mouse button came up outside the window, where no pointerup reaches us.
    if (event.pointerType === "mouse" && (event.buttons & 1) === 0) {
      abortDrag();
      return;
    }
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (current.axis === null) {
      if (Math.abs(dx) < swipeSlopPx && Math.abs(dy) < swipeSlopPx) return;
      current.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (current.axis === "y") return;
      // The rest of the swipe comes here even when the pointer leaves the row.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    setDragOffset(Math.min(0, Math.max(-swipeActionWidthPx, current.base + dx)));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragOffset(null);
    if (current.axis !== "x") return;
    const ended = Math.min(0, Math.max(-swipeActionWidthPx, current.base + event.clientX - current.startX));
    if (!cancelled) setOpen(ended < -swipeOpenThresholdPx);
    swipeEndedAt.current = performance.now();
  }

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    const ended = swipeEndedAt.current;
    swipeEndedAt.current = null;
    const afterSwipe = ended !== null && performance.now() - ended < clickAfterSwipeMs;
    if (afterSwipe || open) {
      // The click that ends a swipe, or a tap on an open row, never opens the item.
      event.preventDefault();
      event.stopPropagation();
      if (!afterSwipe) setOpen(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    swipeEndedAt.current = null;
    if (event.key !== "Escape" || !open) return;
    event.stopPropagation();
    // Focus never stays on the action once the row has covered it.
    if (event.target === actionRef.current) {
      frontRef.current?.querySelector<HTMLElement>(rowFocusTarget)?.focus();
    }
    setOpen(false);
  }

  return (
    // The row clips what slides out, so focus rings are drawn inside it.
    <div
      ref={rootRef}
      onKeyDown={onKeyDown}
      className={cx("relative overflow-hidden [&_:focus-visible]:outline-offset-[-2px]", className)}
    >
      <div
        ref={frontRef}
        data-testid="swipe-row-front"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endDrag(event, false)}
        onPointerCancel={(event) => endDrag(event, true)}
        onClickCapture={onClickCapture}
        style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)` }}
        className={cx(
          "relative z-[1] touch-pan-y bg-surface select-none",
          dragOffset === null && "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
        )}
      >
        {children}
      </div>
      <button
        ref={actionRef}
        type="button"
        aria-label={actionName}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(event) => {
          setOpen(false);
          // A click from Enter or Space has no pointer behind it (detail 0).
          onAction(event.detail === 0 ? "keyboard" : "pointer");
        }}
        style={{ width: swipeActionWidthPx }}
        className="absolute inset-y-0 right-0 z-0 flex items-center justify-center bg-sky text-row-title text-sky-ink"
      >
        {actionLabel}
      </button>
    </div>
  );
}
