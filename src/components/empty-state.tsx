import type { ReactNode } from "react";
import { cx } from "./cx";

export type EmptyStateProps = {
  /** One short sentence (16/400) from EXPERIENCE.md, State Patterns. */
  children: ReactNode;
  /** A short heading above the text (Story 19.6): "Den här veckan är tom." */
  title?: string;
  /** Where needed, a help line under it (14 px grey). */
  hint?: ReactNode;
  /** The button or link for the next step, when there is one: one, never two. */
  action?: ReactNode;
  className?: string;
};

/** "Inget matchar ”kaffe”.": the sentence of a search without a hit, the same everywhere (Story 19.7). */
export function noMatchText(query: string): string {
  return `Inget matchar ”${query.trim()}”.`;
}

/** The button of a search without a hit. */
export const clearSearchText = "Rensa sökning";

/**
 * What a surface shows when it has nothing yet (Story 19.7: the one component for every empty state):
 * a sentence (with a heading when needed), a help line when needed, and a button for the next step.
 * Text on the page background uses ink-2.
 */
export function EmptyState({ children, title, hint, action, className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}>
      <div className="flex max-w-80 flex-col gap-1">
        {title ? <p className="text-headline text-ink">{title}</p> : null}
        <p className="text-body text-ink-2 wrap-break-word">{children}</p>
      </div>
      {hint ? <p className="max-w-80 text-meta text-ink-3">{hint}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
