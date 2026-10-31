"use client";

import { FilterPills, type FilterOption } from "@/components/filter-pills";
import { recipeSortLabels, type RecipeSort, type RecipeView } from "../domain/recipe-list";

const views: readonly FilterOption<RecipeView>[] = [
  { value: "cards", icon: "\u25A6", label: "Kort" },
  { value: "compact", icon: "\u2630", label: "Lista" },
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
 * chosen sort, and the segmented switch "Kort" / "Lista" (Story 14.4, the shared FilterPills). The line wraps
 * rather than scrolls at 200 % text; every target keeps a 44 px area.
 */
export function RecipeBar({ count, sort, onOpenSort, view, onViewChange }: RecipeBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 px-1 text-meta text-ink-3">
      <p data-testid="recipe-count" aria-live="polite">
        {count} recept
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpenSort}
        data-testid="sort-button"
        className="min-h-tap rounded-sm font-medium text-accent outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <span className="sr-only">Sortera:</span> {recipeSortLabels[sort]} <span aria-hidden="true">▾</span>
      </button>
      {view !== null ? (
        <FilterPills segmented label="Vy" options={views} value={view} onChange={onViewChange} className="ml-auto [&>button]:px-2.5" />
      ) : null}
    </div>
  );
}
