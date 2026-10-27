"use client";

import { recipeMetaText, type RecipeListItem } from "../domain/recipe-list";
import { RecipeCard } from "./recipe-card";
import { RecipeStatusBadge } from "./recipe-status-badge";

export type RecipeListProps = {
  recipes: readonly RecipeListItem[];
  /** Whether each recipe is a favourite now, by id. */
  favorites: Readonly<Record<string, boolean>>;
  onFavoriteChange: (id: string, isFavorite: boolean) => void;
  /**
   * Whether the cards are ranked fewest missing first (the filter Kan lagas
   * nu), which the list's name says, since there are no headings or groups.
   */
  ranked?: boolean;
};

/**
 * The library's recipe cards, in the order given (newest first, or ranked):
 * one column on a phone, two from 1024 px (EXPERIENCE.md, Responsive). Each
 * has the status on its image ("Kan lagas nu" or "Saknar N varor"; none when
 * the pantry could not be read) and the heart.
 */
export function RecipeList({ recipes, favorites, onFavoriteChange, ranked = false }: RecipeListProps) {
  return (
    <ul aria-label={ranked ? "Recept, minst saknat först" : "Recept"} className="grid gap-3 desktop:grid-cols-2">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          title={recipe.title}
          imageUrl={recipe.imageUrl}
          meta={recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
          href={`/recept/${recipe.id}`}
          badge={
            recipe.missingCount !== null ? <RecipeStatusBadge missingCount={recipe.missingCount} onImage /> : undefined
          }
          favorite={{
            pressed: favorites[recipe.id] ?? recipe.isFavorite,
            onPressedChange: (isFavorite) => onFavoriteChange(recipe.id, isFavorite),
          }}
        />
      ))}
    </ul>
  );
}
