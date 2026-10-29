"use client";

import { type CSSProperties, type PointerEvent, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { formatPortions } from "@/components/stepper";
import { swipeSlopPx } from "@/components/swipe-row";
import type { RecipeStatus } from "@/features/pantry";
import type { CookStep } from "../domain/cook-steps";
import type { SavedRecipeLine } from "../domain/saved-recipe";
import { IngredientRow, lineCoverage } from "./ingredient-row";
import { useWakeLock } from "./use-wake-lock";

/** A horizontal swipe at least this long changes the step. */
export const stepSwipeDistancePx = 48;
/** How far, in px, a new step slides in from (none with "Minska rörelse"). */
const stepSlidePx = 24;

export const wakeLockUnavailableText = "Skärmen kan släckas i den här webbläsaren.";
/** The heading over the lines on step 1 that belong to no step. */
export const otherLinesHeading = "Övriga ingredienser";

export type CookModeProps = {
  /** The recipe's title, in the dialog's name and at the top. */
  title: string;
  /** The servings chosen in the recipe view, as metadata at the top. */
  servings: number;
  /** The recipe's steps, each with its lines already scaled to `servings` (cookSteps). Never empty. */
  steps: readonly CookStep<SavedRecipeLine>[];
  /** The recipe view's status for the same servings, or `null` without a pantry: no marks then. */
  status: RecipeStatus | null;
  /** The factor the lines were scaled with, for the "×2" beside a line without ingredient. */
  factor: number;
  /** Called on "Stäng", Esc or a close the browser starts; the caller unmounts the step mode. */
  onClose: () => void;
  /** Where focus goes when Pontus closes the step mode: "Laga nu". */
  returnFocusRef: RefObject<HTMLElement | null>;
  /**
   * "Markera som lagad" from the page (mealplan, AD-1, Story 13.4), shown
   * above Föregående and Nästa at the last step; left out when the recipe is
   * not on the menu.
   */
  finish?: ReactNode;
};

type Drag = { pointerId: number; startX: number; startY: number; axis: "x" | "y" | null };

/** Where the step mode is: the step's id, so a re-read of the recipe keeps it; the index if the id goes. */
type Position = { stepId: string | null; index: number; direction: number };

const withModifier = (event: globalThis.KeyboardEvent) =>
  event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;

/**
 * Stegläge (FR-21, UX-DR12): the recipe one step at a time, full screen, in a
 * native modal `<dialog>`, so it lies above the tab bar and "Lägg på
 * matsedeln" and the page behind is inert. It has no address of its own and
 * keeps nothing between openings: it always starts at step 1. The caller
 * mounts it to open it and unmounts it to close it.
 *
 * At the top, the line about the screen when the Wake Lock cannot be had
 * (not an error, so no alert), the title and the servings, and "Stäng". Then
 * "Steg N av M", focused when the step mode opens, the step's lines as in the
 * recipe view (IngredientRow, with tick or ring and the scaled amount), on
 * step 1 also the lines of no step under "Övriga ingredienser", and the step's
 * text in the step type (24 px). A change of step is announced as "Steg N av
 * M: <text>" in a hidden live region, and focus stays where it is.
 * Föregående and Nästa are always there in the thumb zone; at either end the
 * one that cannot go further is aria-disabled and stays in the tab order, as
 * in the portion selector. A swipe to the left over the step goes to the next
 * step and one to the right to the previous; a vertical drag scrolls the
 * step. ArrowRight and ArrowLeft do the same on a computer wherever focus is
 * (one step per press, however long the key is held), and Esc closes. The
 * screen is kept on (useWakeLock) and the page behind does not scroll while it
 * is open. When Pontus closes it, focus goes back to `returnFocusRef`; when a
 * client navigation hides the page, it closes without moving focus.
 */
export function CookMode({ title, servings, steps, status, factor, onClose, returnFocusRef, finish }: CookModeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const closedByUser = useRef(false);
  const drag = useRef<Drag | null>(null);
  const [position, setPosition] = useState<Position>(() => ({ stepId: steps[0]?.id ?? null, index: 0, direction: 0 }));
  const [announcement, setAnnouncement] = useState("");
  const { unavailable } = useWakeLock(true);

  // The steps can change while open (the page is read again): the same step
  // stays, found by its id; only when it is gone is the index kept, within the steps.
  const last = steps.length - 1;
  const found = steps.findIndex((candidate) => candidate.id === position.stepId);
  const current = found >= 0 ? found : Math.max(0, Math.min(position.index, last));
  // Where the step is now, for when it goes: moved by a step added or removed before it.
  if (found >= 0 && found !== position.index) setPosition({ ...position, index: found });
  const step = steps[current];
  const atFirst = current <= 0;
  const atLast = current >= last;

  // Shown as a modal while mounted. The cleanup also runs when the page is
  // hidden by a client navigation, so the dialog never stays in the top layer.
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    closing.current = false;
    closedByUser.current = false;
    if (!dialog.open) dialog.showModal();
    headingRef.current?.focus();
    // The page behind keeps its scroll position and does not scroll under the step mode.
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const returnFocus = returnFocusRef;
    return () => {
      closing.current = true;
      if (dialog.open) dialog.close();
      root.style.overflow = overflow;
      // Not when a client navigation hides the page: focus stays with the new page.
      if (closedByUser.current) returnFocus.current?.focus();
    };
  }, [returnFocusRef]);

  function close() {
    closedByUser.current = true;
    onClose();
  }

  function go(to: number) {
    const target = steps[to];
    if (!target || to === current) return;
    setPosition({ stepId: target.id, index: to, direction: Math.sign(to - current) });
    setAnnouncement(`Steg ${to + 1} av ${steps.length}: ${target.text}`);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }

  // The keys work wherever focus is, also after a tap on the step's text,
  // which leaves focus outside the dialog's controls.
  const keys = useRef({ go, current, close });
  useLayoutEffect(() => {
    keys.current = { go, current, close };
  });
  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) return;
      const { go, current, close } = keys.current;
      if (event.key === "Escape") {
        // Handled here rather than only in `cancel`, which the browser may not let us stop twice.
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      if (withModifier(event)) return;
      event.preventDefault();
      // A held key moves one step, not through the whole recipe.
      if (event.repeat) return;
      go(event.key === "ArrowRight" ? current + 1 : current - 1);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // A new pointer always starts afresh, so a drag whose end never came cannot linger.
    drag.current = null;
    if (!event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, axis: null };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const started = drag.current;
    if (!started || started.pointerId !== event.pointerId) return;
    // No button down: the end of the drag happened where we did not see it.
    if (event.buttons === 0) {
      drag.current = null;
      return;
    }
    if (started.axis !== null) return;
    const dx = event.clientX - started.startX;
    const dy = event.clientY - started.startY;
    if (Math.abs(dx) < swipeSlopPx && Math.abs(dy) < swipeSlopPx) return;
    // A vertical drag is left to the step's scroll.
    started.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (started.axis === "x") event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const started = drag.current;
    if (!started || started.pointerId !== event.pointerId) return;
    drag.current = null;
    if (started.axis !== "x") return;
    // A mouse drag that selected text was meant to select it.
    if (event.pointerType === "mouse" && (window.getSelection()?.toString() ?? "") !== "") return;
    const dx = event.clientX - started.startX;
    if (dx <= -stepSwipeDistancePx) go(current + 1);
    else if (dx >= stepSwipeDistancePx) go(current - 1);
  }

  function forgetDrag() {
    drag.current = null;
  }

  function row(line: SavedRecipeLine) {
    return (
      <IngredientRow
        key={line.id}
        line={line}
        coverage={status ? lineCoverage(status, line.id) : null}
        factor={factor}
      />
    );
  }

  if (!step) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label={`Stegläge: ${title}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={(event) => {
        // Closed by the browser (a close request it would not let us stop) rather than by the
        // cleanup. The event comes after a task, so a dialog shown again since (an effect run
        // twice in development) is left open.
        if (!closing.current && !event.currentTarget.open) close();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-bg p-0 text-ink"
    >
      <div className="flex h-full flex-col">
        <header className="shrink-0 px-page pt-[max(var(--gutter-mobile),env(safe-area-inset-top))]">
          <div className="mx-auto flex max-w-content flex-col gap-1">
            {unavailable ? (
              <p className="text-meta text-ink-2" data-testid="wake-lock-note">
                {wakeLockUnavailableText}
              </p>
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col pt-2.5">
                <p className="text-row-title break-words text-ink">{title}</p>
                <p className="text-meta text-ink-2">{formatPortions(servings)}</p>
              </div>
              <Button variant="text" onClick={close} className="-mr-3 shrink-0">
                Stäng
              </Button>
            </div>
          </div>
        </header>

        <div
          ref={scrollerRef}
          data-testid="cook-step"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={forgetDrag}
          onLostPointerCapture={forgetDrag}
          onPointerLeave={forgetDrag}
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-page"
        >
          <div className="mx-auto flex max-w-content flex-col gap-4 py-5">
            <h2 ref={headingRef} tabIndex={-1} className="text-row-title text-ink-2">
              Steg {current + 1} av {steps.length}
            </h2>
            <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="cook-step-announcement">
              {announcement}
            </p>
            <div
              key={step.id}
              style={{ "--step-from": `${position.direction * stepSlidePx}px` } as CSSProperties}
              className="flex flex-col gap-5 motion-safe:animate-step-in"
            >
              {step.lines.length > 0 || step.otherLines.length > 0 ? (
                <div className="flex flex-col gap-1 rounded-lg bg-surface px-4 py-1">
                  {step.lines.length > 0 ? <ul className="flex flex-col">{step.lines.map(row)}</ul> : null}
                  {step.otherLines.length > 0 ? (
                    <>
                      <h3
                        className={cx("text-section-label text-ink-2", step.lines.length > 0 ? "pt-3" : "pt-2")}
                      >
                        {otherLinesHeading}
                      </h3>
                      <ul className="flex flex-col">{step.otherLines.map(row)}</ul>
                    </>
                  ) : null}
                </div>
              ) : null}
              <p className="text-step break-words text-ink" data-testid="cook-step-text">
                {step.text}
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-page pt-3 pb-[calc(env(safe-area-inset-bottom)+var(--gutter-mobile))]">
          {/* Side by side; with large text Nästa wraps below Föregående, still in the thumb zone. */}
          {atLast && finish ? <div className="mx-auto mb-3 flex max-w-content flex-col [&>*]:w-full">{finish}</div> : null}
          <div className="mx-auto flex max-w-content flex-wrap gap-3">
            <Button
              variant="secondary"
              aria-disabled={atFirst || undefined}
              onClick={() => go(current - 1)}
              className={cx("grow basis-auto", disabledLook)}
            >
              Föregående
            </Button>
            <Button
              aria-disabled={atLast || undefined}
              onClick={() => go(current + 1)}
              className={cx("grow basis-auto", disabledLook)}
            >
              Nästa
            </Button>
          </div>
        </div>
      </div>
    </dialog>
  );
}

/** aria-disabled instead of disabled keeps the button in the tab order and focused (as in Stepper). */
const disabledLook = "aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
