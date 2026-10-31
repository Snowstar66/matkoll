"use client";

import { planningButtonText, type PlanningTarget } from "@/features/mealplan";
import { recipeMetaText, type RecipeListItem } from "../domain/recipe-list";
import { dishEmoji } from "../domain/dish-emoji";
import { AddToPlanButton, type AddToPlan } from "./add-to-plan-button";
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
  /** Planning mode (Story 13.8): each card has "Lägg på onsdag" and opens the recipe in the same mode. */
  planning?: PlanningTarget;
  addToPlan?: AddToPlan;
};

/**
 * The library's recipe cards, in the order given (newest first, or ranked):
 * one column on a phone, two from 1024 px (EXPERIENCE.md, Responsive). Each
 * has the status on its image ("Kan lagas nu" or "Saknar N varor"; none when
 * the pantry could not be read) and the heart.
 */
export function RecipeList({ recipes, favorites, onFavoriteChange, ranked = false, planning, addToPlan }: RecipeListProps) {
  return (
    <ul aria-label={ranked ? "Recept, minst saknat först" : "Recept"} className="grid gap-3 desktop:grid-cols-2">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          title={recipe.title}
          imageUrl={recipe.imageUrl}
          emoji={dishEmoji(recipe.title)}
          meta={recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
          href={planning ? `/recept/${recipe.id}?planera=${planning.date}` : `/recept/${recipe.id}`}
          quickAction={
            planning && addToPlan ? (
              <AddToPlanButton
                recipeId={recipe.id}
                addToPlan={addToPlan}
                servings={recipe.originalServings}
                fullWidth={false}
                planning={planning}
                ariaLabel={`${planningButtonText(planning)}: ${recipe.title}`}
              />
            ) : undefined
          }
          badge={
            recipe.missingCount !== null ? (
              <RecipeStatusBadge missingCount={recipe.missingCount} missingNames={recipe.missingNames} onImage />
            ) : undefined
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
