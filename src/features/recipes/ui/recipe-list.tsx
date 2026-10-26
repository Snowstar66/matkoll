"use client";

import type { RecipeListItem } from "../domain/recipe-list";
import { RecipeRow } from "./recipe-row";

export type RecipeListProps = {
  recipes: readonly RecipeListItem[];
  /** Whether each recipe is a favourite now, by id. */
  favorites: Readonly<Record<string, boolean>>;
  onFavoriteChange: (id: string, isFavorite: boolean) => void;
  /**
   * Whether the rows are ranked fewest missing first (the filter Kan lagas
   * nu), which the list's name says, since there are no headings or groups.
   */
  ranked?: boolean;
};

/** The library's recipe rows, in the order given (newest first, or ranked). */
export function RecipeList({ recipes, favorites, onFavoriteChange, ranked = false }: RecipeListProps) {
  return (
    <ul aria-label={ranked ? "Recept, minst saknat först" : "Recept"} className="flex flex-col gap-3">
      {recipes.map((recipe) => (
        <RecipeRow
          key={recipe.id}
          recipe={recipe}
          isFavorite={favorites[recipe.id] ?? recipe.isFavorite}
          onFavoriteChange={(isFavorite) => onFavoriteChange(recipe.id, isFavorite)}
        />
      ))}
    </ul>
  );
}
