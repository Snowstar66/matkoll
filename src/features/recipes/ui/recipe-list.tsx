"use client";

import { OfferTags } from "@/components/offer-tag";
import type { OfferTagData } from "@/lib/offer-tag";
import { recipeMetaText, type RecipeListItem } from "../domain/recipe-list";
import { dishEmoji } from "../domain/dish-emoji";
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
  /** Story 9.3 (the filter Erbjudanden): the offers each recipe uses, by id, as OfferTags under the time line (one on a narrow card, the shortest, then "+N"); the list's name then says most offers first. */
  offerTags?: Readonly<Record<string, readonly OfferTagData[]>>;
};

/**
 * The library's recipe cards, in the order given (newest first, or ranked):
 * two columns on a phone as in the sketch (Story 14.4; one when 200 % text leaves no room for 10 rem tiles), three from 1024 px. Each
 * has the status on its image ("Kan lagas nu" or "Saknar N varor"; none when
 * the pantry could not be read) and the heart.
 */
export function RecipeList({ recipes, favorites, onFavoriteChange, ranked = false, offerTags }: RecipeListProps) {
  return (
    <ul aria-label={offerTags ? "Recept, flest erbjudanden först" : ranked ? "Recept, minst saknat först" : "Recept"} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3 desktop:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          title={recipe.title}
          tile
          imageUrl={recipe.imageUrl}
          emoji={dishEmoji(recipe.title)}
          meta={recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
          href={`/recept/${recipe.id}`}
          offerTags={offerTags && offerTags[recipe.id]?.length ? <OfferTags tags={offerTags[recipe.id]} max={1} shortest /> : undefined}
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
