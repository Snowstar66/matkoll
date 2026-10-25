"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/** How long a short confirmation stays (EXPERIENCE.md, Kort bekräftelse). */
export const toastDurationMs = 4000;
export const toastWithUndoDurationMs = 5000;

export type ToastOptions = {
  /** Shows "Ångra"; called once if Pontus taps it before the toast goes away. */
  onUndo?: () => void;
};

type ToastState = { id: number; message: string; onUndo?: () => void };

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
 * that is always in the page; "Ångra" sits outside it. At most one at a time; a
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

  const showToast = useCallback((message: string, options?: ToastOptions) => {
    nextId.current += 1;
    remaining.current = { id: nextId.current, ms: options?.onUndo ? toastWithUndoDurationMs : toastDurationMs };
    setToast({ id: nextId.current, message, onUndo: options?.onUndo });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast || paused) return;
    const { id } = toast;
    const started = Date.now();
    const timer = setTimeout(
      () => setToast((current) => (current?.id === id ? null : current)),
      remaining.current.id === id ? remaining.current.ms : 0,
    );
    return () => {
      clearTimeout(timer);
      if (remaining.current.id === id) remaining.current.ms -= Date.now() - started;
    };
  }, [toast, paused]);

  const api = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {toast?.message}
      </div>
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
            className="pointer-events-auto flex min-h-tap w-full max-w-content items-center gap-3 rounded-md bg-ink py-1 pr-1 pl-4 text-body text-surface"
          >
            {/* The live region above already reads the message out. */}
            <p aria-hidden="true" className="flex-1 py-2">
              {toast.message}
            </p>
            {toast.onUndo ? (
              <button
                type="button"
                onClick={() => {
                  const undo = toast.onUndo;
                  setToast(null);
                  undo?.();
                }}
                className="min-h-tap shrink-0 rounded-md px-3 text-body font-semibold text-mint"
              >
                Ångra
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
