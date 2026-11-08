"use client";

import { Chip, ChipRow, ChipSeparator } from "@/components/chip";
import { RECIPE_CATEGORIES, recipeCategoryIcons, recipeCategoryLabels, type RecipeCategory } from "../domain/recipe-category";
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
  /** Story 9.3: the pill Erbjudanden is there only when the page gives the library the offers. */
  withOffers?: boolean;
  /** Näring: the chip Nyttigt, there only when "Visa näring" is on and the page has worked the recipes out. */
  withHealthy?: boolean;
  /** Delade recept: the chip Delade, first in the row, there only with Tillval "Visa delade recept" on. */
  withShared?: boolean;
};

/**
 * The library's filters on one row (Story 19.3): Favoriter, Kan lagas nu and (Story 9.3) Erbjudanden, a thin divider, then
 * the categories, each with its emoji before the name. The row scrolls sideways inside itself with snap, no scrollbar and a fade at the
 * right edge. Every chip is a toggle (`aria-pressed`); pressing the chosen one lets it go, and with
 * nothing chosen every recipe shows. The two groups are independent, as before.
 */
export function RecipeFilterChips({ filter, onFilterChange, category, onCategoryChange, available, withOffers = false, withHealthy = false, withShared = false }: RecipeFilterChipsProps) {
  const categories = RECIPE_CATEGORIES.filter((entry) => entry === category || !available || available.has(entry));
  return (
    <ChipRow role="group" aria-label="Filter" data-testid="recipe-filters">
      {withShared ? (
        <Chip className="snap-start" aria-pressed={filter === "shared"} selected={filter === "shared"} onClick={() => onFilterChange(filter === "shared" ? "all" : "shared")}>
          Delade
        </Chip>
      ) : null}
      <Chip className="snap-start" aria-pressed={filter === "favorites"} selected={filter === "favorites"} onClick={() => onFilterChange(filter === "favorites" ? "all" : "favorites")}>
        Favoriter
      </Chip>
      <Chip className="snap-start" aria-pressed={filter === "cookable"} selected={filter === "cookable"} onClick={() => onFilterChange(filter === "cookable" ? "all" : "cookable")}>
        Kan lagas nu
      </Chip>
      {withHealthy ? (
        <Chip className="snap-start" aria-pressed={filter === "healthy"} selected={filter === "healthy"} onClick={() => onFilterChange(filter === "healthy" ? "all" : "healthy")}>
          Nyttigt
        </Chip>
      ) : null}
      {withOffers ? (
        <Chip className="snap-start" aria-pressed={filter === "offers"} selected={filter === "offers"} onClick={() => onFilterChange(filter === "offers" ? "all" : "offers")}>
          Erbjudanden
        </Chip>
      ) : null}
      {categories.length > 0 ? <ChipSeparator /> : null}
      {categories.map((entry) => {
        const selected = category === entry;
        return (
          <Chip key={entry} className="snap-start" icon={recipeCategoryIcons[entry]} aria-pressed={selected} selected={selected} onClick={() => onCategoryChange(selected ? null : entry)}>
            {recipeCategoryLabels[entry]}
          </Chip>
        );
      })}
    </ChipRow>
  );
}
