"use client";

import { cx } from "@/components/cx";
import { recipeSortLabels, type RecipeSort, type RecipeView } from "../domain/recipe-list";

const views: readonly { value: RecipeView; icon: string; label: string }[] = [
  { value: "cards", icon: "▦", label: "Kortvy" },
  { value: "compact", icon: "☰", label: "Kompakt vy" },
];

export type RecipeBarProps = {
  /** How many recipes are shown. */
  count: number;
  sort: RecipeSort;
  onOpenSort: () => void;
  /** `null` hides the switch (planning mode shows cards only). */
  view: RecipeView | null;
  onViewChange: (view: RecipeView) => void;
};

/**
 * The library's quiet line (Story 1.16): "12 recept", the sort button with the
 * chosen sort, and the switch between Kortvy and Kompakt vy. The line wraps
 * rather than scrolls at 200 % text; every target keeps a 44 px area.
 */
export function RecipeBar({ count, sort, onOpenSort, view, onViewChange }: RecipeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 px-1 text-meta text-ink-3">
      <p data-testid="recipe-count" aria-live="polite">
        {count} recept
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpenSort}
        data-testid="sort-button"
        className="min-h-tap rounded-sm font-semibold text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <span className="sr-only">Sortera:</span> {recipeSortLabels[sort]} <span aria-hidden="true">▾</span>
      </button>
      {view !== null ? (
        <div role="group" aria-label="Vy" className="ml-auto flex">
          {views.map((option) => {
            const pressed = option.value === view;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                aria-pressed={pressed}
                onClick={() => onViewChange(option.value)}
                className="group flex min-h-tap min-w-tap items-center justify-center rounded-sm outline-none"
              >
                <span
                  aria-hidden="true"
                  className={cx(
                    "flex h-[30px] w-9 items-center justify-center rounded-sm text-body leading-none",
                    "group-focus-visible:outline-2 group-focus-visible:outline-offset-1 group-focus-visible:outline-accent",
                    pressed ? "bg-surface text-ink" : "bg-hairline text-ink-3",
                  )}
                >
                  {option.icon}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
