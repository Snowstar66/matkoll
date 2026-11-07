"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfferTags } from "@/components/offer-tag";
import type { OfferTagData } from "@/lib/offer-tag";
import { HeartToggle } from "@/components/heart-toggle";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { RecipeImage } from "@/components/recipe-image";
import { SwipeRow } from "@/components/swipe-row";
import { recipeTimeText, type RecipeListItem } from "../domain/recipe-list";
import { useRecipeDelete } from "./recipe-delete";

export type RecipeCompactListProps = {
  recipes: readonly RecipeListItem[];
  /** Whether each recipe is a favourite now, by id. */
  favorites: Readonly<Record<string, boolean>>;
  onFavoriteChange: (id: string, isFavorite: boolean) => void;
  /** Whether the rows are ranked fewest missing first, which the list's name says. */
  ranked?: boolean;
  /** Story 9.3 (the filter Erbjudanden): the offers each recipe uses, by id; a row has OfferTags on a line of its own (two, then "+N"). */
  offerTags?: Readonly<Record<string, readonly OfferTagData[]>>;
  /** The ids of the recipes on the current meal plan, which "Ta bort X?" says (Story 13.2). */
  onMenuIds?: readonly string[];
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
export function RecipeCompactList({ recipes, favorites, onFavoriteChange, ranked = false, offerTags, onMenuIds }: RecipeCompactListProps) {
  const router = useRouter();
  // A recipe that is gone leaves the list at once; the server's list follows after the refresh.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const { ask, dialog } = useRecipeDelete((id) => {
    setGone((ids) => new Set(ids).add(id));
    router.refresh();
  });
  return (
    <>
      {dialog}
    <ListGroup label={offerTags ? "Recept, flest erbjudanden först" : ranked ? "Recept, minst saknat först" : "Recept"} className="[&>li]:border-b-0">
      {recipes.filter((recipe) => !gone.has(recipe.id)).map((recipe) => {
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
          <li key={recipe.id} data-testid="recipe-row" className="relative after:absolute after:right-0 after:bottom-0 after:left-20 after:h-px after:bg-hairline last:after:hidden">
          <SwipeRow
            actionLabel="Ta bort"
            actionName={`Svep bort ${recipe.title}`}
            onAction={() => ask({ id: recipe.id, title: recipe.title, onMenu: onMenuIds?.includes(recipe.id) ?? false })}
          >
          <ListRow
            as="div"
            className="min-h-[72px] [&>a]:pl-3 [&>div:first-child]:pl-3"
            href={`/recept/${recipe.id}`}
            title={<span className="block truncate">{recipe.title}</span>}
            meta={
              <>
                {time ? `${time} · ` : ""}
                {portionsText(recipe.originalServings)}
                {status ? " · " : ""}
                {status}
                {offerTags && offerTags[recipe.id]?.length ? (
                  <OfferTags tags={offerTags[recipe.id]} className="mt-1" />
                ) : null}
              </>
            }
            leading={
              <RecipeImage
                src={recipe.imageUrl}
                dish={recipe.dish}
                title={recipe.title}
                artSize={44}
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
          </SwipeRow>
          </li>
        );
      })}
    </ListGroup>
    </>
  );
}
