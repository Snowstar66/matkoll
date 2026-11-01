import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * The reserved-width label (Story 19.3): the label is drawn in its chosen weight (600), and an
 * invisible 600 copy in the same grid cell holds the width, so a chip or segment does not jump
 * when it changes between 500 and 600.
 */
export function ReservedLabel({ children, className }: { children: string; className?: string }) {
  return (
    <span
      data-label={children}
      className={cx(
        "grid min-w-0 truncate after:invisible after:col-start-1 after:row-start-1 after:block after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]",
        className,
      )}
    >
      <span className="col-start-1 row-start-1 truncate">{children}</span>
    </span>
  );
}

export type ChipProps = Omit<ComponentProps<"button">, "children"> & {
  selected: boolean;
  /** A decorative glyph before the label; the label is the name. */
  icon?: string;
  children: string;
  /** Dashed outline for a "new" chip that is not a choice. */
  dashed?: boolean;
  /** A number after the label in 400 weight, e.g. "Förslag 2" in Inkorg (Story 20.3). */
  count?: number;
  /** Story 18.23: an action in chip form ("Ta", "Fyll på"): the quiet chip with its text in `--accent`. Never selected. */
  action?: boolean;
};

/**
 * Chip (Story 19.3): the one look of a choice that filters or picks. 32 px, fully round, 12 px
 * side air, a 44 px tap area. Quiet `--surface` with a hairline when not chosen, filled accent
 * with 600 text when chosen. Pass `role="radio"` + `aria-checked`, or `aria-pressed` for a toggle.
 */
export function Chip({ selected, icon, children, dashed = false, action = false, count, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      {...rest}
      className={cx(
        "group relative flex h-8 shrink-0 items-center rounded-pill border px-3 text-control whitespace-nowrap outline-none",
        "before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60",
        selected
          ? "border-accent bg-accent font-semibold text-on-accent"
          : cx("border-border bg-surface font-medium", dashed || action ? "text-accent" : "text-ink-2", dashed && "border-dashed"),
        className,
      )}
    >
      {icon ? (
        // A 16 px box with the glyph at 15 px: every emoji the same optical size, centred, and the
        // chip stays 32 px high. A little less air on the left, as the glyph has its own.
        <span aria-hidden="true" data-testid="chip-icon" className="-ml-0.5 mr-1.5 flex size-4 shrink-0 items-center justify-center text-[15px] leading-none select-none">
          {icon}
        </span>
      ) : null}
      <ReservedLabel>{children}</ReservedLabel>
      {count === undefined ? null : <span className="ml-1 font-normal opacity-80">{count}</span>}
    </button>
  );
}

/** A thin divider between two groups of chips in one row. */
export function ChipSeparator(): ReactNode {
  return <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 self-center bg-border" />;
}

/**
 * One row of chips that scrolls sideways inside itself (never the page), snaps, hides its
 * scrollbar and fades out at the right edge. It bleeds to the page gutters.
 */
export function ChipRow({ children, className, ...rest }: { children: ReactNode; className?: string } & Omit<ComponentProps<"div">, "children">) {
  return (
    <div
      {...rest}
      className={cx(
        "-mx-gutter -my-1 flex snap-x scroll-px-gutter gap-2 overflow-x-auto overscroll-x-contain px-gutter py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(90deg,#000_88%,transparent)] desktop:[mask-image:none]",
        className,
      )}
    >
      {children}
    </div>
  );
}
