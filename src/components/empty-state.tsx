import type { ReactNode } from "react";
import { cx } from "./cx";

export type EmptyStateProps = {
  /** One or two short sentences from EXPERIENCE.md, State Patterns. */
  children: ReactNode;
  /** A short heading above the text (Story 19.6): "Den här veckan är tom." */
  title?: string;
  /** A button or link that gets Pontus going, when there is one. */
  action?: ReactNode;
  className?: string;
};

/** What a surface shows when it has nothing yet. Text on the page background uses ink-2. */
export function EmptyState({ children, title, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-4 px-4 py-12 text-center", className)}>
      <div className="flex max-w-80 flex-col gap-1">
        {title ? <p className="text-headline text-ink">{title}</p> : null}
        <p className="text-body text-ink-2">{children}</p>
      </div>
      {action}
    </div>
  );
}
