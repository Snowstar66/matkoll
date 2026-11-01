import type { ReactNode } from "react";
import { cx } from "@/components/cx";

// The welcome tour's line drawings (Story 20.1), from hjalp-valkomst.html:
// inline SVG on a 280 × 220 grid, 2.4 px lines in the accent (`g`) with one
// warm detail (`w`), on a soft round plate. The look is in globals.css
// (.tour-art); lines marked `d` are drawn out on the page that shows, which is
// why they have pathLength 1. No photos, no emoji.

export type TourArtName = "home" | "recipe" | "plan" | "fridge" | "shelf";

/** Drawn out on the page that shows: pathLength 1 makes the dash the whole line. */
const drawn = { pathLength: 1 } as const;

const art: Record<TourArtName, ReactNode> = {
  home: (
    <>
      <circle className="bgc" cx="140" cy="112" r="96" />
      <path className="g d" {...drawn} d="M64 118 L140 56 L216 118" />
      <path className="g d" {...drawn} d="M80 106 V178 a8 8 0 0 0 8 8 H192 a8 8 0 0 0 8-8 V106" />
      <path className="g d" {...drawn} d="M176 76 V58 h14 v30" />
      <path className="w d" {...drawn} style={{ strokeWidth: 4 }} d="M114 146 l18 18 34-38" />
      <path className="g d" {...drawn} d="M30 186 H250" />
      <path className="w d" {...drawn} d="M226 44 v16 M218 52 h16" />
    </>
  ),
  recipe: (
    <>
      <circle className="bgc" cx="148" cy="112" r="96" />
      <rect className="g d paper" {...drawn} x="100" y="40" width="100" height="140" rx="12" />
      <rect className="g d" {...drawn} x="112" y="52" width="76" height="44" rx="6" />
      <path className="g d" {...drawn} d="M112 112h60 M112 126h76 M112 140h50 M112 154h66" />
      <path className="w d" {...drawn} d="M200 22 l4.5 11 11 4.5 -11 4.5 -4.5 11 -4.5-11 -11-4.5 11-4.5z" />
      <rect className="g d paper" {...drawn} x="16" y="52" width="34" height="18" rx="9" />
      <rect className="w d" {...drawn} x="38" y="52" width="34" height="18" rx="9" />
      <path className="w dash" d="M78 62 C88 62 92 66 98 72" />
      <path className="g d paper" {...drawn} d="M18 136 h10 l5-8 h16 l5 8 h10 v38 H18z" />
      <circle className="w d" {...drawn} cx="41" cy="155" r="9" />
      <path className="w dash" d="M68 150 C82 150 88 144 98 138" />
      <rect className="g d paper" {...drawn} x="216" y="98" width="50" height="44" rx="8" />
      <path className="g d" {...drawn} d="M226 112h30 M226 126h20" />
      <path className="w dash" d="M214 120 C208 120 206 118 202 116" />
    </>
  ),
  plan: (
    <>
      <circle className="bgc" cx="140" cy="112" r="96" />
      <rect className="g d paper" {...drawn} x="22" y="50" width="112" height="120" rx="12" />
      <path className="g d" {...drawn} d="M22 80h112 M52 38v22 M104 38v22" />
      <rect className="g d" {...drawn} x="36" y="94" width="24" height="18" rx="4" />
      <rect className="w d" {...drawn} x="66" y="94" width="24" height="18" rx="4" />
      <rect className="g d" {...drawn} x="96" y="94" width="24" height="18" rx="4" />
      <rect className="w d" {...drawn} x="36" y="122" width="24" height="18" rx="4" />
      <rect className="g d" {...drawn} x="66" y="122" width="24" height="18" rx="4" />
      <rect className="g d" {...drawn} x="96" y="122" width="24" height="18" rx="4" />
      <path className="w d" {...drawn} d="M146 110 h30 M168 101 l9 9 -9 9" />
      <rect className="g d paper" {...drawn} x="188" y="42" width="72" height="136" rx="10" />
      <circle className="w d" {...drawn} cx="206" cy="74" r="7" />
      <path className="w d" {...drawn} d="M202.5 74 l2.5 2.5 4.5-5" />
      <path className="g d" {...drawn} d="M220 74h28" />
      <circle className="w d" {...drawn} cx="206" cy="106" r="7" />
      <path className="w d" {...drawn} d="M202.5 106 l2.5 2.5 4.5-5" />
      <path className="g d" {...drawn} d="M220 106h22" />
      <circle className="g d" {...drawn} cx="206" cy="138" r="7" />
      <path className="g d" {...drawn} d="M220 138h26" />
    </>
  ),
  fridge: (
    <>
      <circle className="bgc" cx="140" cy="114" r="96" />
      <path className="w d" {...drawn} d="M66 30 h-22 v22 M214 30 h22 v22 M66 200 h-22 v-22 M214 200 h22 v-22" />
      <rect className="g d paper" {...drawn} x="92" y="40" width="104" height="150" rx="12" />
      <path className="g d" {...drawn} d="M92 86h104" />
      <path className="g d paper" {...drawn} d="M92 46 L66 60 V176 L92 186" />
      <path className="g d" {...drawn} d="M100 122h88 M100 156h88 M100 68h88" />
      <rect className="w d" {...drawn} x="106" y="96" width="12" height="26" rx="4" />
      <circle className="g d" {...drawn} cx="140" cy="111" r="10" />
      <path className="g d" {...drawn} d="M140 101 c2-5 6-6 9-5" />
      <rect className="g d" {...drawn} x="162" y="102" width="20" height="20" rx="4" />
      <circle className="g d" {...drawn} cx="114" cy="148" r="7" />
      <circle className="g d" {...drawn} cx="132" cy="148" r="7" />
      <rect className="g d" {...drawn} x="156" y="134" width="22" height="22" rx="5" />
      <path className="g d" {...drawn} d="M106 60 h20 M150 52 v12" />
    </>
  ),
  shelf: (
    <>
      <circle className="bgc" cx="130" cy="116" r="96" />
      <path className="g d" {...drawn} d="M26 40v152 M182 40v152 M26 90h156 M26 142h156 M26 192h156" />
      <rect className="g d" {...drawn} x="38" y="58" width="46" height="32" rx="4" />
      <rect className="g d" {...drawn} x="92" y="66" width="38" height="24" rx="4" />
      <rect className="g d" {...drawn} x="40" y="110" width="56" height="32" rx="4" />
      <path className="g d" {...drawn} d="M58 124h20" />
      <rect className="w d" {...drawn} x="114" y="114" width="20" height="28" rx="3" />
      <circle className="w d" {...drawn} cx="124" cy="126" r="5" />
      <circle className="w dash" cx="124" cy="128" r="24" />
      <rect className="g d" {...drawn} x="110" y="160" width="50" height="32" rx="4" />
      <rect className="g d" {...drawn} x="40" y="168" width="30" height="24" rx="4" />
      <path
        className="w d paper"
        {...drawn}
        d="M170 22 h84 a10 10 0 0 1 10 10 v30 a10 10 0 0 1-10 10 h-46 l-14 13 v-13 h-24 a10 10 0 0 1-10-10 v-30 a10 10 0 0 1 10-10z"
      />
      <path className="g d" {...drawn} d="M178 40h62 M178 54h40" />
    </>
  ),
};

/**
 * One of the tour's line drawings, 300 × 236 px (`small`: 220 × 173 px, the first page, which
 * also has the trio). Decoration: the page's heading says what it shows.
 */
export function TourArt({ name, small = false, className }: { name: TourArtName; small?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 280 220"
      aria-hidden="true"
      focusable="false"
      className={cx(
        "tour-art block shrink-0 overflow-visible",
        small ? "h-[173px] w-[220px]" : "h-[236px] w-[300px] max-w-full",
        className,
      )}
    >
      {art[name]}
    </svg>
  );
}
