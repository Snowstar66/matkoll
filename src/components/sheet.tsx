"use client";

import { type ReactNode, type TouchEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "./button";
import { cx } from "./cx";

/** How far a downward swipe on the sheet's top must go to close it. */
export const swipeCloseDistancePx = 80;

export type SheetProps = {
  open: boolean;
  /** Called when the sheet should close; the caller sets `open` to false. */
  onClose: () => void;
  title: string;
  /** A line under the title, e.g. the store a product choice is for; it also describes the dialog. */
  subtitle?: string;
  children: ReactNode;
  /** Unsaved changes: closing first asks "Släng ändringarna?". */
  isDirty?: boolean;
  /** The text button in the header, usually "Klar" or "Avbryt". */
  closeLabel?: string;
  /** Buttons at the bottom of the sheet, e.g. the primary action. */
  footer?: ReactNode;
  /** While true (e.g. while saving), nothing closes the sheet and the header button is disabled. */
  preventClose?: boolean;
  /**
   * `close`: focus starts on the header button ("Avbryt"), e.g. for a question
   * before something is deleted. Otherwise the browser picks the first control.
   */
  initialFocus?: "close";
};

type SheetEntry = {
  isDirty: () => boolean;
  /** Where focus goes when this sheet closes. */
  opener: () => HTMLElement | null;
  /** Closes without asking. */
  forceClose: () => void;
  /** Shows "Släng ändringarna?" on behalf of a sheet that wants to replace this one. */
  askDiscard: (discard: () => void, keep: () => void) => void;
};

// Sheets never stack (EXPERIENCE.md, Ark): the sheet that is showing, if any.
let shownSheet: SheetEntry | null = null;

function focusable(element: Element | null): HTMLElement | null {
  return element instanceof HTMLElement && element !== document.body ? element : null;
}

/**
 * Ark: slides up from the bottom on mobile and is a centred dialog (at most 560 px)
 * from 1024 px. Built on the native modal `<dialog>`, so focus stays inside and the
 * page behind is inert. Closes with the header button, Esc, a tap outside, a
 * downward swipe on its top or a close the browser starts (back gesture,
 * `form method="dialog"`); with `isDirty` every one of them asks first.
 *
 * Opening a sheet while another shows replaces it; if the first has unsaved
 * changes it asks, and the new one opens only after "Släng ändringarna".
 * On close, focus returns to the opener, else to the opener of the sheet it
 * replaced, else to the main content.
 */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  isDirty = false,
  closeLabel = "Klar",
  footer,
  preventClose = false,
  initialFocus,
}: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pointerDownOnBackdrop = useRef(false);
  const swipeStartY = useRef<number | null>(null);
  const titleId = useId();
  const subtitleId = useId();
  const [confirming, setConfirming] = useState(false);
  // A sheet waiting to replace this one, while "Släng ändringarna?" is showing.
  const pendingReplace = useRef<{ discard: () => void; keep: () => void } | null>(null);
  const focusBeforeConfirm = useRef<HTMLElement | null>(null);
  const restoreFocusAfterConfirm = useRef(false);

  // Latest props for event handlers and the registry.
  const latest = useRef({ onClose, isDirty, preventClose, initialFocus });
  useEffect(() => {
    latest.current = { onClose, isDirty, preventClose, initialFocus };
  }, [onClose, isDirty, preventClose, initialFocus]);

  function askConfirm() {
    focusBeforeConfirm.current = focusable(document.activeElement);
    setConfirming(true);
  }

  function leaveConfirm() {
    restoreFocusAfterConfirm.current = true;
    setConfirming(false);
    const pending = pendingReplace.current;
    pendingReplace.current = null;
    pending?.keep();
  }

  function discardChanges() {
    setConfirming(false);
    const pending = pendingReplace.current;
    pendingReplace.current = null;
    if (pending) pending.discard();
    else latest.current.onClose();
  }

  // Back from "Släng ändringarna?" to where focus was, or the close button.
  useEffect(() => {
    if (confirming || !restoreFocusAfterConfirm.current) return;
    restoreFocusAfterConfirm.current = false;
    const before = focusBeforeConfirm.current;
    focusBeforeConfirm.current = null;
    const target = before?.isConnected && dialogRef.current?.contains(before) ? before : closeButtonRef.current;
    target?.focus();
  }, [confirming]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    let active = true;
    const opener = focusable(document.activeElement);
    let replacedOpener: HTMLElement | null = null;
    const me: SheetEntry = {
      isDirty: () => latest.current.isDirty,
      opener: () => (opener?.isConnected ? opener : replacedOpener),
      forceClose: () => latest.current.onClose(),
      askDiscard: (discard, keep) => {
        pendingReplace.current = { discard, keep };
        askConfirm();
      },
    };

    const show = () => {
      if (!active) return;
      shownSheet = me;
      if (!dialog.open) dialog.showModal();
      if (latest.current.initialFocus === "close") closeButtonRef.current?.focus();
    };

    const previous = shownSheet;
    if (previous && previous !== me) {
      replacedOpener = previous.opener();
      if (previous.isDirty()) {
        // The first sheet asks; this one opens after "Släng ändringarna", or gives up.
        previous.askDiscard(
          () => {
            previous.forceClose();
            show();
          },
          () => latest.current.onClose(),
        );
      } else {
        previous.forceClose();
        show();
      }
    } else {
      show();
    }

    return () => {
      active = false;
      if (shownSheet === me) shownSheet = null;
      if (dialog.open) dialog.close();
      pendingReplace.current = null;
      setConfirming(false);
      // Never move focus behind another sheet that is showing.
      if (shownSheet) return;
      const target = [opener, replacedOpener].find((element) => element?.isConnected) ?? document.getElementById("innehall");
      target?.focus();
    };
  }, [open]);

  function requestClose() {
    if (latest.current.preventClose) return;
    if (latest.current.isDirty) askConfirm();
    else latest.current.onClose();
  }

  function setSwipeOffset(px: number | null) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // The whole sheet follows the finger, without the open transition lagging behind.
    dialog.style.transform = px === null ? "" : `translateY(${px}px)`;
    dialog.style.transition = px === null ? "" : "none";
  }

  function onTouchStart(event: TouchEvent) {
    swipeStartY.current = event.touches[0]?.clientY ?? null;
  }

  function onTouchMove(event: TouchEvent) {
    const start = swipeStartY.current;
    const y = event.touches[0]?.clientY;
    if (start === null || y === undefined) return;
    setSwipeOffset(Math.max(0, y - start));
  }

  function onTouchEnd(event: TouchEvent) {
    const start = swipeStartY.current;
    const y = event.changedTouches[0]?.clientY;
    swipeStartY.current = null;
    setSwipeOffset(null);
    if (start !== null && y !== undefined && y - start >= swipeCloseDistancePx) requestClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onKeyDown={(event) => {
        // Handled here rather than only in `cancel`, so a dirty sheet can always ask first.
        if (event.key === "Escape") {
          event.preventDefault();
          if (confirming) leaveConfirm();
          else requestClose();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!confirming) requestClose();
      }}
      onClose={(event) => {
        // Closed by the browser while still meant to be open (back gesture, form method="dialog",
        // a cancel the browser would not let us stop).
        if (!open) return;
        // The "close" of an effect's own `dialog.close()` arrives as a task after the effect has
        // run again (React's Strict Mode, or a hidden page shown again) and shown the dialog anew:
        // that is no close to follow, or a sheet mounted open would shut at once.
        if (event.currentTarget.open) return;
        if (latest.current.preventClose) {
          event.currentTarget.showModal();
        } else if (latest.current.isDirty) {
          event.currentTarget.showModal();
          if (!confirming) askConfirm();
        } else {
          latest.current.onClose();
        }
      }}
      onPointerDown={(event) => {
        pointerDownOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The panel fills the dialog box, so a click on the dialog itself is on the veil.
        if (event.target === event.currentTarget && pointerDownOnBackdrop.current && !confirming) requestClose();
        pointerDownOnBackdrop.current = false;
      }}
      className={cx(
        "m-0 mt-auto max-h-[90dvh] w-full max-w-none overflow-hidden rounded-t-xl bg-surface p-0 text-ink",
        "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:starting:open:translate-y-full",
        "desktop:m-auto desktop:w-[calc(100%-2*var(--gutter-mobile))] desktop:max-w-dialog desktop:rounded-xl",
        "desktop:motion-safe:starting:open:translate-y-4 desktop:motion-safe:starting:open:opacity-0 desktop:motion-safe:transition-[transform,opacity]",
      )}
    >
      {open ? (
        <div className="flex max-h-[90dvh] flex-col">
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => {
              swipeStartY.current = null;
              setSwipeOffset(null);
            }}
            data-testid="sheet-handle"
            className="shrink-0 touch-none px-page pt-2"
          >
            <div aria-hidden="true" className="mx-auto h-[5px] w-9 rounded-full bg-border desktop:hidden" />
            <div className="flex min-h-tap items-center justify-between gap-3 pt-2 desktop:pt-3">
              <h2 id={titleId} className="text-row-title text-ink">
                {title}
              </h2>
              {confirming ? null : (
                <Button
                  ref={closeButtonRef}
                  variant="text"
                  disabled={preventClose}
                  onClick={requestClose}
                  className="-mr-3"
                >
                  {closeLabel}
                </Button>
              )}
            </div>
            {subtitle ? (
              <p id={subtitleId} className="-mt-1 text-meta break-words text-ink-2">
                {subtitle}
              </p>
            ) : null}
          </div>
          {confirming ? (
            <div className="flex flex-col gap-3 px-page pt-2 pb-[calc(env(safe-area-inset-bottom)+var(--gutter-mobile))]">
              <p role="alert" className="text-body text-ink">
                Släng ändringarna?
              </p>
              <Button variant="secondary" fullWidth onClick={discardChanges}>
                Släng ändringarna
              </Button>
              <Button variant="text" fullWidth autoFocus onClick={leaveConfirm}>
                Fortsätt ändra
              </Button>
            </div>
          ) : null}
          {/* Hidden, not unmounted, while asking, so "Fortsätt ändra" keeps what was typed. */}
          <div hidden={confirming} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-page pt-2 pb-gutter">
            {children}
          </div>
          {footer ? (
            <div
              hidden={confirming}
              className="flex shrink-0 flex-col gap-2 px-page pb-[calc(env(safe-area-inset-bottom)+var(--gutter-mobile))]"
            >
              {footer}
            </div>
          ) : (
            <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)] shrink-0" />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
