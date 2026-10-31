"use client";

import { cx } from "@/components/cx";
import { RECIPE_CATEGORIES, recipeCategoryLabels, type RecipeCategory } from "../domain/recipe-category";

/**
 * The icon and tile of each recipe category, in the same style as the
 * categories of Inköpslista (CategoryHeader's categoryTiles): an emoji on a
 * light tile, both decoration beside the name.
 */
const categoryTiles: Record<RecipeCategory, { icon: string; tile: string }> = {
  meat: { icon: "🥩", tile: "bg-tile-clay" },
  poultry: { icon: "🍗", tile: "bg-sand" },
  fish: { icon: "🐟", tile: "bg-sky" },
  vegetarian: { icon: "🥦", tile: "bg-mint" },
  pasta: { icon: "🍝", tile: "bg-tile-lilac" },
  soup: { icon: "🍲", tile: "bg-sand" },
  salad: { icon: "🥗", tile: "bg-mint" },
  stew: { icon: "🥘", tile: "bg-tile-clay" },
  quick: { icon: "⏱️", tile: "bg-sky" },
};

export type RecipeCategoryChipsProps = {
  /** The chosen category, or `null` for none. */
  value: RecipeCategory | null;
  /** The chip pressed; the chosen one is pressed again to let it go (`null`). */
  onChange: (category: RecipeCategory | null) => void;
};

/**
 * Kategorichips (Story 1.17): one row that scrolls sideways inside itself,
 * never the page. Each is a toggle button (`aria-pressed`): a 34 px chip with
 * a 24 px icon tile in a 44 px tap area. One category at a time; pressing the
 * chosen one lets it go.
 */
export function RecipeCategoryChips({ value, onChange }: RecipeCategoryChipsProps) {
  return (
    <div role="group" aria-label="Kategori" className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
      {RECIPE_CATEGORIES.map((category) => {
        const selected = value === category;
        const { icon, tile } = categoryTiles[category];
        return (
          <button
            key={category}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(selected ? null : category)}
            className="group flex min-h-tap shrink-0 items-center rounded-pill outline-none"
          >
            <span
              className={cx(
                "flex h-[34px] items-center gap-1.5 rounded-pill border-[1.5px] pr-3 pl-1.5 text-meta font-semibold whitespace-nowrap",
                "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent",
                selected ? "border-accent bg-mint text-accent" : "border-border text-ink-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cx("flex size-6 items-center justify-center rounded-sm text-meta leading-none select-none", tile)}
              >
                {icon}
              </span>
              {recipeCategoryLabels[category]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
