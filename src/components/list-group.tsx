import type { ReactNode } from "react";
import { cx } from "./cx";

type DataAttributes = { [key: `data-${string}`]: string | number | boolean | undefined };

export type ListGroupProps = DataAttributes & {
  /** The rows: `ListRow`s (each an `li`), or `li`s of the caller's own. */
  children: ReactNode;
  /** The id of the heading the list belongs to, usually the `CategoryHeader` above it. */
  labelledBy?: string;
  /** A name for the list when no heading names it. */
  label?: string;
  className?: string;
};

/**
 * Listgrupp (DESIGN.md, list-group; UX-DR24, UX-DR25): a white card with
 * `rounded-lg` and hairline dividers between its rows, as a list. The rows
 * under a category heading lie in one list group. The card clips its rows,
 * so a swiped row or a pressed background keeps the round corners; rows put
 * their focus ring inside themselves.
 */
export function ListGroup({ children, labelledBy, label, className, ...data }: ListGroupProps) {
  return (
    <ul
      {...data}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      className={cx("flex flex-col divide-y divide-hairline overflow-hidden rounded-lg bg-surface", className)}
    >
      {children}
    </ul>
  );
}
