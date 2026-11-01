import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

export type ListGroupProps = DataAttributes & {
  /** The rows: `ListRow`s (each an `li`), or `li`s of the caller's own. */
  children: ReactNode;
  /** The id of the heading the list belongs to, usually the `CategoryHeader` above it. */
  labelledBy?: string;
  /** A name for the list when no heading names it. */
  label?: string;
  /**
   * Dividers that start at the text instead of at the edge (Story 19.7), in px
   * from the left edge: 56 after a 36 px tile or a check, 16 for plain rows.
   */
  inset?: number;
  className?: string;
};

/**
 * Listgrupp (DESIGN.md, list-group; UX-DR24, UX-DR25): a white card with
 * `rounded-lg` and hairline dividers between its rows, as a list. The rows
 * under a category heading lie in one list group. The card clips its rows,
 * so a swiped row or a pressed background keeps the round corners; rows put
 * their focus ring inside themselves.
 */
export function ListGroup({ children, labelledBy, label, inset, className, ...data }: ListGroupProps) {
  return (
    <ul
      {...data}
      // Preflight's list-style: none makes VoiceOver in Safari drop the list; the role puts it back.
      role="list"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      style={inset === undefined ? undefined : ({ "--inset": `${inset}px` } as CSSProperties)}
      className={cx(
        "flex flex-col overflow-hidden rounded-lg bg-surface",
        inset === undefined
          ? "divide-y divide-hairline"
          : "[&>li+li]:relative [&>li+li]:before:pointer-events-none [&>li+li]:before:absolute [&>li+li]:before:top-0 [&>li+li]:before:right-0 [&>li+li]:before:left-(--inset) [&>li+li]:before:border-t [&>li+li]:before:border-hairline [&>li+li]:before:content-['']",
        className,
      )}
    >
      {children}
    </ul>
  );
}
