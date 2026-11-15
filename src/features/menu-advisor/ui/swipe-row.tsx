"use client";

import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { TrashIcon } from "@/components/icons";

// A row that can be taken away in two ways: the soptunna at its right, or a swipe to the left (a thumb across the card).
// The swipe only starts when the finger moves more sideways than up or down, so the page still scrolls, and a swipe that
// ends past the limit removes the row; a shorter one lets it spring back. A swipe never counts as a tap on the row.

/** How far the row must be pulled to the left to be taken away, in pixels. */
export const swipeLimit = 80;
const maxPull = 140;
/** The finger must move this far sideways, and clearly more sideways than up or down, before it is a swipe. */
const startDistance = 12;

export function SwipeRow({ onRemove, removeLabel, children }: { onRemove: () => void; removeLabel: string; children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const pull = useRef(0);

  function down(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
    pull.current = 0;
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (!swiped.current) {
      if (Math.abs(dx) < startDistance || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swiped.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    pull.current = Math.max(-maxPull, Math.min(0, dx));
    setOffset(pull.current);
  }

  function up() {
    if (!start.current) return;
    start.current = null;
    if (swiped.current && pull.current <= -swipeLimit) onRemove();
    pull.current = 0;
    setOffset(0);
    setDragging(false);
  }

  return (
    <div data-testid="menu-proposal-row" className="relative overflow-hidden rounded-xl">
      <div aria-hidden="true" className="absolute inset-0 flex items-center justify-end rounded-xl bg-danger-tint pr-6 text-danger">
        <TrashIcon size={22} />
      </div>
      <div
        data-testid="menu-proposal-swipe"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(event) => {
          if (swiped.current) {
            swiped.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        style={{ transform: offset === 0 ? undefined : `translateX(${offset}px)`, touchAction: "pan-y" }}
        className={`relative flex items-stretch gap-1 ${dragging ? "" : "transition-transform duration-150 motion-reduce:transition-none"}`}
      >
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          data-testid="menu-dismiss-proposal"
          aria-label={removeLabel}
          onClick={onRemove}
          className="flex size-tap shrink-0 items-center justify-center self-center rounded-pill text-ink-3"
        >
          <TrashIcon size={18} />
        </button>
      </div>
    </div>
  );
}
