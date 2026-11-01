"use client";

import { HeartToggle } from "@/components/heart-toggle";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { RecipeImage } from "@/components/recipe-image";
import { dishEmoji } from "../domain/dish-emoji";
import { recipeTimeText, type RecipeListItem } from "../domain/recipe-list";

export type RecipeCompactListProps = {
  recipes: readonly RecipeListItem[];
  /** Whether each recipe is a favourite now, by id. */
  favorites: Readonly<Record<string, boolean>>;
  onFavoriteChange: (id: string, isFavorite: boolean) => void;
  /** Whether the rows are ranked fewest missing first, which the list's name says. */
  ranked?: boolean;
};

/** "4 port." for the line under a title. */
function portionsText(servings: number): string {
  return `${servings} port.`;
}

/**
 * Kompakt vy (Story 1.16): the recipes as one grouped list like Inköpslista's,
 * about twice as many to a screen. Each row has a 48 px picture, the title on
 * one line (with "…"; the whole title is still its accessible name), "25 min ·
 * 4 port. · Kan lagas nu" (or "Saknar 2") and the heart in a 44 px area. A tap
 * on the row opens the recipe.
 */
export function RecipeCompactList({ recipes, favorites, onFavoriteChange, ranked = false }: RecipeCompactListProps) {
  return (
    <ListGroup label={ranked ? "Recept, minst saknat först" : "Recept"} className="[&>li]:border-b-0">
      {recipes.map((recipe) => {
        const time = recipeTimeText(recipe.totalMinutes);
        const status =
          recipe.missingCount === null ? null : recipe.missingCount === 0 ? (
            <span className="font-medium text-mint-ink">Kan lagas nu</span>
          ) : (
            <span className="font-medium text-sky-ink">
              Saknar {recipe.missingCount} {recipe.missingCount === 1 ? "vara" : "varor"}
            </span>
          );
        return (
          <ListRow
            key={recipe.id}
            data-testid="recipe-row"
            className="relative min-h-[72px] after:absolute after:right-0 after:bottom-0 after:left-20 after:h-px after:bg-hairline last:after:hidden [&>a]:pl-3 [&>div:first-child]:pl-3"
            href={`/recept/${recipe.id}`}
            title={<span className="block truncate">{recipe.title}</span>}
            meta={
              <>
                {time ? `${time} · ` : ""}
                {portionsText(recipe.originalServings)}
                {status ? " · " : ""}
                {status}
              </>
            }
            leading={
              <RecipeImage
                src={recipe.imageUrl}
                emoji={dishEmoji(recipe.title)}
                iconSize={28}
                className="size-14 rounded-[10px]"
              />
            }
            trailing={
              <HeartToggle
                pressed={favorites[recipe.id] ?? recipe.isFavorite}
                onPressedChange={(isFavorite) => onFavoriteChange(recipe.id, isFavorite)}
                label={`Favorit, ${recipe.title}`}
                className="focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent"
              />
            }
          />
        );
      })}
    </ListGroup>
  );
}
