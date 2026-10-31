"use client";

import { Chip, ChipRow, ChipSeparator } from "@/components/chip";
import { RECIPE_CATEGORIES, recipeCategoryLabels, type RecipeCategory } from "../domain/recipe-category";
import type { RecipeFilter } from "../domain/recipe-list";

export type RecipeFilterChipsProps = {
  /** The chosen filter; `all` is the default and has no chip: nothing chosen shows every recipe. */
  filter: RecipeFilter;
  onFilterChange: (filter: RecipeFilter) => void;
  /** The chosen category, or `null` for none. */
  category: RecipeCategory | null;
  /** The chip pressed; the chosen one is pressed again to let it go (`null`). */
  onCategoryChange: (category: RecipeCategory | null) => void;
  /**
   * The categories at least one recipe in the whole library belongs to (Story 14.4); only
   * these get a chip, plus the chosen one even when it has none left. Left out: all of them.
   */
  available?: ReadonlySet<RecipeCategory>;
};

/**
 * The library's filters on one row (Story 19.3): Favoriter and Kan lagas nu, a thin divider, then
 * the categories. The row scrolls sideways inside itself with snap, no scrollbar and a fade at the
 * right edge. Every chip is a toggle (`aria-pressed`); pressing the chosen one lets it go, and with
 * nothing chosen every recipe shows. The two groups are independent, as before.
 */
export function RecipeFilterChips({ filter, onFilterChange, category, onCategoryChange, available }: RecipeFilterChipsProps) {
  const categories = RECIPE_CATEGORIES.filter((entry) => entry === category || !available || available.has(entry));
  return (
    <ChipRow role="group" aria-label="Filter" data-testid="recipe-filters">
      <Chip className="snap-start" aria-pressed={filter === "favorites"} selected={filter === "favorites"} onClick={() => onFilterChange(filter === "favorites" ? "all" : "favorites")}>
        Favoriter
      </Chip>
      <Chip className="snap-start" aria-pressed={filter === "cookable"} selected={filter === "cookable"} onClick={() => onFilterChange(filter === "cookable" ? "all" : "cookable")}>
        Kan lagas nu
      </Chip>
      {categories.length > 0 ? <ChipSeparator /> : null}
      {categories.map((entry) => {
        const selected = category === entry;
        return (
          <Chip key={entry} className="snap-start" aria-pressed={selected} selected={selected} onClick={() => onCategoryChange(selected ? null : entry)}>
            {recipeCategoryLabels[entry]}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
