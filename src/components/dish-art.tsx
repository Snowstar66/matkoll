import type { DishKind } from "@/lib/dish-kind";
import { cx } from "./cx";
import { dishDrawings } from "./dish-drawings";

// UX-13b: a recipe without its own photo is drawn as its kind of dish, in the
// two-tone line style of Hjälp och tips and the welcome tour: the app's green
// line with one warm detail (--warm), on the app's mint plate (Pontus 2026-11-07: keep the app green).
// Only tokens, so dark mode follows by itself. Decoration, so aria-hidden.

/** The plate behind each kind of dish: the app's mint for all (Pontus 2026-11-07), kept per kind so a tone can differ again. */
export const dishTone: Record<DishKind, string> = {
  gryta: "bg-mint",
  kott: "bg-mint",
  kyckling: "bg-mint",
  pasta: "bg-mint",
  fisk: "bg-mint",
  soppa: "bg-mint",
  ugnsratt: "bg-mint",
  gratang: "bg-mint",
  paj: "bg-mint",
  bakat: "bg-mint",
  sallad: "bg-mint",
  wok: "bg-mint",
  tallrik: "bg-mint",
};

/** The line's width on screen: a little heavier on a card than in a thumbnail, as the app's line icons. */
function linePx(size: number): number {
  if (size >= 64) return 2.6;
  if (size >= 44) return 2.2;
  return 2;
}

export type DishArtProps = {
  dish: DishKind;
  /** Width and height in px. */
  size: number;
  className?: string;
};

/** The drawing alone, on a 64 × 64 grid, the line the same width on screen at any size. */
export function DishArt({ dish, size, className }: DishArtProps) {
  const strokeWidth = (linePx(size) * 64) / size;
  return (
    <svg
      data-testid="recipe-illustration"
      data-dish={dish}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth.toFixed(2)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx("shrink-0 text-accent", className)}
    >
      {dishDrawings[dish].map((line) => (
        <path key={line.d} d={line.d} className={line.warm ? "stroke-warm" : undefined} />
      ))}
    </svg>
  );
}
