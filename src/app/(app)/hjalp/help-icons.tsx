import type { ReactNode } from "react";

// The two-tone line icons of Hjälp och tips (Story 20.2, hjalp-valkomst.html): the
// lines in the icon's colour (`--accent` by default) and one detail in `--warm`.
// Decoration only: the text beside them carries the meaning, so each is aria-hidden.

const warm = "stroke-warm";

const drawings = {
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path className={warm} d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  pot: (
    <>
      <path d="M5 11h14v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM3 11h18" />
      <path className={warm} d="M9.5 3.5c-.8 1.2.8 2.3 0 3.5M14.5 3.5c-.8 1.2.8 2.3 0 3.5" />
    </>
  ),
  steps: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h6" />
      <path className={warm} strokeWidth={2.8} d="M5 6.5h.01M5 12h.01M5 17.5h.01" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
      <path className={warm} d="M9.5 15l2 2 3.5-3.5" />
    </>
  ),
  plus: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path className={warm} d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  house: (
    <>
      <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path className={warm} d="M9 14.5l2 2 4-4" />
    </>
  ),
  list: (
    <>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path className={warm} d="M3.5 6.5l1.2 1.2L7 5.4M3.5 12l1.2 1.2L7 10.9M3.5 17.5l1.2 1.2L7 16.4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path className={warm} d="M8.5 12.3l2.3 2.3 4.7-4.9" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8.5h13l-1 11.5h-11z" />
      <path className={warm} d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
  fridge: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M6 10h12" />
      <path className={warm} d="M9 6v2M9 13v3" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle className={warm} cx="12" cy="13" r="3.5" />
    </>
  ),
  undo: (
    <>
      <path d="M4.5 9.5h10a5.5 5.5 0 0 1 0 11H11" />
      <path className={warm} d="M8.5 5.5l-4 4 4 4" />
    </>
  ),
  door: (
    <>
      <path d="M6.5 20V4.5h11V20M3.5 20h17" />
      <path className={warm} strokeWidth={2.8} d="M14.5 12.5h.01" />
    </>
  ),
  shelf: (
    <>
      <path d="M3.5 10.5h17M3.5 19.5h17M4 4v16M20 4v16" />
      <path className={warm} d="M7 10.5V7h5v3.5M12.5 19.5V15h4.5v4.5" />
    </>
  ),
  ask: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.9-3.9" />
      <path className={warm} d="M9.3 9.2a1.8 1.8 0 1 1 2.6 1.6c-.5.2-.9.6-.9 1.2v.2M11 14.4h.01" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle className={warm} cx="12" cy="10" r="2.3" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path className={warm} d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="2.5" />
      <path className={warm} d="M12 9v5M9.5 11.5h5" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v1h6v-1c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z" />
      <path className={warm} d="M9.5 19h5M10.5 21.5h3" />
    </>
  ),
  star: (
    <>
      <path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z" />
      <path className={warm} d="M12 8.6v2.8" />
    </>
  ),
  bubble: (
    <>
      <path d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9a1.5 1.5 0 0 1-1.5 1.5h-7l-4.5 3.5v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5z" />
      <path className={warm} d="M12 7.8v3.6M12 13.6h.01" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type HelpIconName = keyof typeof drawings;

/** A two-tone line icon: `className` sets the main colour (text-accent by default). */
export function HelpIcon({ name, size = 28, className = "text-accent" }: { name: HelpIconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {drawings[name]}
    </svg>
  );
}

/** The round green play button's triangle, filled. */
export function PlayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7.5v9l7.5-4.5z" fill="currentColor" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}

/** ⊕ that becomes ⊖ when the `<details>` around it (a `group`) is open: the vertical bar fades. */
export function PlusMinusIcon() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0 text-accent"
    >
      <circle cx="14" cy="14" r="12" />
      <path d="M9 14h10" />
      <path d="M14 9v10" className="transition-opacity duration-200 group-open:opacity-0 motion-reduce:transition-none" />
    </svg>
  );
}
