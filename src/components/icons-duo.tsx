import type { ReactNode } from "react";
import { cx } from "./cx";

// Two-tone line icons (Epic 20, hjalp-valkomst.html): the app's green line with
// one warm detail (--warm, decoration only). Same 24 px grid and 1.8 px line as
// icons.tsx; decoration, so aria-hidden like them. The warm part is drawn by
// the children marked with the `warm` class below.

export type DuoIconProps = {
  /** Width and height in px. */
  size?: number;
  className?: string;
};

/** The warm detail of a two-tone icon. */
const warm = "stroke-warm";

function DuoIcon({ size = 28, className, children }: DuoIconProps & { children: ReactNode }) {
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
      className={cx("shrink-0 text-accent", className)}
    >
      {children}
    </svg>
  );
}

/** A recipe book with a bookmark: Recept och matsedel, Lägg till ett recept. */
export function DuoBookmarkIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M5 17a3 3 0 0 1 3-3h11" />
      <path className={warm} d="M10 4v6l2-1.5 2 1.5V4" />
    </DuoIcon>
  );
}

/** A fridge: Matvaror. */
export function DuoFridgeIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M6 10h12" />
      <path className={warm} d="M9 6v2M9 13v3" />
    </DuoIcon>
  );
}

/** A storage box: Förråd. */
export function DuoBoxIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path className={warm} d="M10 13h4" />
    </DuoIcon>
  );
}

/** A camera with a warm lens: Fotografera kylen. */
export function DuoCameraIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle className={warm} cx="12" cy="13" r="3.5" />
    </DuoIcon>
  );
}

/** A compass: Titta runt själv. */
export function DuoCompassIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path className={warm} d="M15.5 8.5l-2 5-5 2 2-5z" />
    </DuoIcon>
  );
}

/** A house with a warm check: Livskoll itself (the tour's last page, Så funkar Livskoll). */
export function DuoHouseIcon(props: DuoIconProps) {
  return (
    <DuoIcon {...props}>
      <path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path className={warm} d="M9 14.5l2 2 4-4" />
    </DuoIcon>
  );
}
