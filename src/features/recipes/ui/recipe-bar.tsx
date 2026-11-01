"use client";

import { GridIcon, ListIcon, SortIcon } from "@/components/icons";
import { Segment, type SegmentOption } from "@/components/segment";
import { recipeSortLabels, type RecipeSort, type RecipeView } from "../domain/recipe-list";

const views: readonly SegmentOption<RecipeView>[] = [
  { value: "cards", icon: <GridIcon size={18} />, iconOnly: true, label: "Kort" },
  { value: "compact", icon: <ListIcon size={18} />, iconOnly: true, label: "Lista" },
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
 * chosen sort, and the icon switch "Kort" / "Lista" (Segment, Story 19.3). The line wraps
 * rather than scrolls at 200 % text; every target keeps a 44 px area.
 */
export function RecipeBar({ count, sort, onOpenSort, view, onViewChange }: RecipeBarProps) {
  return (
    <div className="-my-1 flex flex-wrap items-center gap-x-3 px-1 text-meta text-ink-2">
      <p data-testid="recipe-count" aria-live="polite" className="mr-auto">
        {count} recept
      </p>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={onOpenSort}
        data-testid="sort-button"
        className="flex min-h-tap items-center gap-1 rounded-sm text-control font-medium text-ink-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <SortIcon size={18} />
        <span className="sr-only">Sortera:</span>{" "}
        {recipeSortLabels[sort]}
      </button>
      {view !== null ? (
        <Segment size="small" label="Vy" options={views} value={view} onChange={onViewChange} />
      ) : null}
    </div>
  );
}
