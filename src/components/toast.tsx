"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** How long a short confirmation stays (EXPERIENCE.md, Kort bekräftelse). */
export const toastDurationMs = 4000;
export const toastWithUndoDurationMs = 5000;
/** A confirmation with "Visa" for a finished AI job (Story 12.4, EXPERIENCE.md): Pontus may be reading or typing when it comes. */
export const toastWithShowDurationMs = 8000;

export type ToastOptions = {
  /** Shows "Ångra"; called once if Pontus taps it before the toast goes away. */
  onUndo?: () => void;
  /** The undo button's text when it undoes only part of what the message says, e.g. "Ångra borttagning"; "Ångra" otherwise. */
  undoLabel?: string;
  /**
   * Called once when the toast goes away without "Ångra": its time ran out,
   * it was dismissed, or a new toast replaced it.
   */
  onClose?: () => void;
  /**
   * A button that takes Pontus to something ("Visa", Story 12.4) instead of
   * undoing: called once if it is tapped before the toast goes away, and the
   * toast goes with it. It stays toastWithShowDurationMs, 8 s.
   */
  show?: { label?: string; onShow: () => void };
  /**
   * Waits for a toast with "Ångra" that is showing, instead of replacing it,
   * and is shown when that one has gone (Story 12.4): a finished AI job never
   * takes the undo of something Pontus just did.
   */
  waitForUndo?: boolean;
  /**
   * `alert` for a failure (e.g. "Det gick inte att ångra."): announced at
   * once through `role="alert"` instead of the polite live region.
   */
  role?: "status" | "alert";
};

type ToastState = {
  id: number;
  message: string;
  onUndo?: () => void;
  undoLabel?: string;
  show?: { label: string; onShow: () => void };
  onClose?: () => void;
  role: "status" | "alert";
};

type ToastApi = {
  /** Shows a short confirmation, replacing any that is showing. */
  showToast: (message: string, options?: ToastOptions) => void;
  dismissToast: () => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** The toast functions; needs a `ToastProvider` above. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast needs a ToastProvider");
  return api;
}

/**
 * Kort bekräftelse: a dark strip at the bottom, above the tab bar and above a
 * FixedAction when there is one. The message is announced through a live region
 * that is always in the page, or as an alert for a failure; "Ångra" sits
 * outside it. At most one at a time; a
 * new one replaces the old. The time stands still while the strip is hovered or
 * has focus, so "Ångra" can be reached.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  // Which toast the pointer is over / has focus inside; a new toast starts unpaused.
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const nextId = useRef(0);
  // Time left for the toast with this id; counts down only while not paused.
  const remaining = useRef<{ id: number; ms: number }>({ id: 0, ms: 0 });
  const paused = toast !== null && (hoveredId === toast.id || focusedId === toast.id);
  // The toast showing now, for onClose; state updaters must stay free of side effects.
  const current = useRef<ToastState | null>(null);
  /** Toasts that waited for an "Ångra" one (ToastOptions.waitForUndo), oldest first. */
  const pending = useRef<{ message: string; options: ToastOptions }[]>([]);

  /** A new toast: its id, and the time it has. */
  const startToast = useCallback((message: string, options?: ToastOptions): ToastState => {
    nextId.current += 1;
    remaining.current = {
      id: nextId.current,
      ms: options?.show ? toastWithShowDurationMs : options?.onUndo ? toastWithUndoDurationMs : toastDurationMs,
    };
    return {
      id: nextId.current,
      message,
      onUndo: options?.onUndo,
      undoLabel: options?.undoLabel,
      show: options?.show ? { label: options.show.label ?? "Visa", onShow: options.show.onShow } : undefined,
      onClose: options?.onClose,
      role: options?.role ?? "status",
    };
  }, []);

  /**
   * Replaces the toast; the one it replaces gets onClose unless it went with
   * "Ångra". When it is closed (`null`), the first toast that waited for it
   * (ToastOptions.waitForUndo) is shown.
   */
  const replaceToast = useCallback(
    function replace(next: ToastState | null, undone = false) {
      const previous = current.current;
      current.current = next;
      setToast(next);
      if (previous && !undone) previous.onClose?.();
      const waiting = next === null ? pending.current.shift() : undefined;
      if (waiting) replace(startToast(waiting.message, waiting.options));
    },
    [startToast],
  );

  const showToast = useCallback(
    (message: string, options?: ToastOptions) => {
      if (options?.waitForUndo && current.current?.onUndo) {
        pending.current.push({ message, options });
        return;
      }
      replaceToast(startToast(message, options));
    },
    [replaceToast, startToast],
  );
  const dismissToast = useCallback(() => replaceToast(null), [replaceToast]);

  useEffect(() => {
    if (!toast || paused) return;
    const { id } = toast;
    const started = Date.now();
    const timer = setTimeout(
      () => {
        if (current.current?.id === id) replaceToast(null);
      },
      remaining.current.id === id ? remaining.current.ms : 0,
    );
    return () => {
      clearTimeout(timer);
      if (remaining.current.id === id) remaining.current.ms -= Date.now() - started;
    };
  }, [toast, paused, replaceToast]);

  const api = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {/* Keyed per toast, so the same text again ("Tog bort Mjölk.") is a change and is announced again. */}
        {toast?.role === "status" ? <span key={toast.id}>{toast.message}</span> : null}
      </div>
      {/* An alert is announced when it appears, so it is only in the page while it shows. */}
      {toast?.role === "alert" ? (
        <div key={toast.id} role="alert" className="sr-only">
          {toast.message}
        </div>
      ) : null}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tab-bar-height)+var(--fixed-action-gap)+var(--fixed-action-offset,0px))] z-40 flex justify-center px-page desktop:bottom-[calc(env(safe-area-inset-bottom)+var(--fixed-action-gap)*2+var(--fixed-action-offset,0px))] desktop:left-side-menu">
        {toast ? (
          <div
            key={toast.id}
            data-testid="toast"
            onPointerEnter={() => setHoveredId(toast.id)}
            onPointerLeave={() => setHoveredId(null)}
            onFocus={() => setFocusedId(toast.id)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusedId(null);
            }}
            className="pointer-events-auto flex min-h-tap w-full max-w-content items-center gap-3 rounded-md bg-ink py-1 pr-1 pl-4 text-body text-surface shadow-float"
          >
            {/* The live region above already reads the message out. */}
            <p aria-hidden="true" className="flex-1 py-2">
              {toast.message}
            </p>
            {toast.show ? (
              <button
                type="button"
                onClick={() => {
                  const onShow = toast.show?.onShow;
                  replaceToast(null);
                  onShow?.();
                }}
                className="min-h-tap shrink-0 rounded-md px-3 text-body font-medium text-mint"
              >
                {toast.show.label}
              </button>
            ) : null}
            {toast.onUndo ? (
              <button
                type="button"
                onClick={() => {
                  const undo = toast.onUndo;
                  replaceToast(null, true);
                  undo?.();
                }}
                className="min-h-tap shrink-0 rounded-md px-3 text-body font-medium text-mint"
              >
                {toast.undoLabel ?? "Ångra"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
