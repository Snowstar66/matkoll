import { type ReactNode, useId } from "react";
import type { IconProps } from "./icons";

// The filled twins of the five tab icons (ikoner.html, variant B): the chosen
// tab and the chosen side-menu item show these in accent, iOS style. Same 24 px
// grid and 1.8 px line as icons.tsx. The shape is solid and its details are cut
// out with a mask, so the tab bar's glass shows through them. Decoration, so
// aria-hidden like the line icons.

function FilledIcon({ size = 24, className, children }: Omit<IconProps, "tinted"> & { children: ReactNode }) {
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
      className={className}
    >
      {children}
    </svg>
  );
}

// A mask works on luminance, not on a theme colour: white keeps, black cuts out.
const keep = "white";
const cut = "black";

/**
 * A mask that keeps the whole 24 px square and cuts out what `children` draw
 * in black. The id is unique per icon, since two tabs can be on one page.
 */
function CutOut({ id, children }: { id: string; children: ReactNode }) {
  return (
    <defs>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill={keep} stroke="none" />
        {children}
      </mask>
    </defs>
  );
}

/** Recept, chosen: the book's cover solid, the pages as a line. */
export function RecipesFilledIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path fill="currentColor" d="M5 4h11a3 3 0 0 1 3 3v7H8a3 3 0 0 0-3 3z" />
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
      <path d="M8 17h11" />
    </FilledIcon>
  );
}

/** Matsedel, chosen: a solid calendar with the header line and the dates cut out. */
export function MealPlanFilledIcon(props: IconProps) {
  const mask = useId();
  return (
    <FilledIcon {...props}>
      <CutOut id={mask}>
        <path d="M4.2 10h15.6" stroke={cut} strokeWidth={1.4} />
        <g fill={cut} stroke="none">
          <rect x="7" y="12.4" width="2.2" height="2.2" rx=".6" />
          <rect x="10.9" y="12.4" width="2.2" height="2.2" rx=".6" />
          <rect x="14.8" y="12.4" width="2.2" height="2.2" rx=".6" />
          <rect x="7" y="15.9" width="2.2" height="2.2" rx=".6" />
          <rect x="10.9" y="15.9" width="2.2" height="2.2" rx=".6" />
        </g>
      </CutOut>
      <g mask={`url(#${mask})`}>
        <rect fill="currentColor" x="4" y="5" width="16" height="15" rx="3" />
      </g>
      <path d="M9 3v3M15 3v3" />
    </FilledIcon>
  );
}

/** Inköpslista, chosen: a solid basket and wheels on the cart's handle. */
export function CartFilledIcon(props: IconProps) {
  return (
    <FilledIcon {...props}>
      <path d="M3 4h2.5l2.2 11" />
      <path fill="currentColor" d="M6.4 7h14.1l-2.2 8H7.7z" />
      <circle fill="currentColor" cx="9.5" cy="19.5" r="1.6" />
      <circle fill="currentColor" cx="17" cy="19.5" r="1.6" />
    </FilledIcon>
  );
}

/** Matvaror, chosen: a solid carrot with its two stripes cut out, the leaves as lines. */
export function CarrotFilledIcon(props: IconProps) {
  const mask = useId();
  return (
    <FilledIcon {...props}>
      <CutOut id={mask}>
        <path d="M9.4 11.5l1.7 1.7M7.3 15.1l1.5 1.5" stroke={cut} strokeWidth={1.3} strokeLinecap="round" />
      </CutOut>
      <g mask={`url(#${mask})`}>
        <path fill="currentColor" d="M11.5 7.5l5 5-11.4 6.9a.9.9 0 0 1-1.2-1.2z" />
      </g>
      <path d="M14 10l-1.2-5.5M14 10l5.5-1.2M14 10l3.4-3.9" />
    </FilledIcon>
  );
}

/** Förråd, chosen: a solid box with the gap under the lid and the handle cut out. */
export function BoxFilledIcon(props: IconProps) {
  const mask = useId();
  return (
    <FilledIcon {...props}>
      <CutOut id={mask}>
        <path d="M1 10.1h22" stroke={cut} strokeWidth={1.3} />
        <path d="M10 13.6h4" stroke={cut} strokeWidth={1.8} strokeLinecap="round" />
      </CutOut>
      <g mask={`url(#${mask})`}>
        <rect fill="currentColor" x="3" y="4" width="18" height="5" rx="1.5" />
        <path fill="currentColor" d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      </g>
    </FilledIcon>
  );
}
