"use client";

import { CheckIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { RecipeImage } from "@/components/recipe-image";
import { recipeMetaText, recipeTimeText } from "../domain/recipe-list";
import { sharedFromText, type SharedListItem } from "../domain/shared-recipe";
import { RecipeCard } from "./recipe-card";

/** Where a shared recipe opens. */
export function sharedRecipeHref(id: string): string {
  return `/recept/delade/${id}`;
}

/** "✓ Sparat" on a shared recipe's image: the household has a copy. Where "Saknar 1 vara" sits on an own recipe, in mint. */
function SavedBadge() {
  return (
    <span data-testid="shared-saved" className="inline-flex items-center gap-1 self-start rounded-sm bg-overlay px-[9px] py-[3px] text-badge text-mint-ink">
      <CheckIcon size={14} className="shrink-0" />
      Sparat
    </span>
  );
}

/**
 * Delade as cards: the same cards as own recipes (image or drawing, title, "45 min · 4 portioner")
 * with "från Lindqvists" under, and no heart and no "Saknar" (someone else's recipe); "✓ Sparat"
 * when the household has saved a copy. A tap opens the shared recipe.
 */
export function SharedRecipeList({ recipes }: { recipes: readonly SharedListItem[] }) {
  return (
    <ul aria-label="Delade recept" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,10rem),1fr))] gap-3 desktop:grid-cols-3">
      {recipes.map((recipe) => (
        <RecipeCard
          key={recipe.id}
          data-testid="shared-recipe-card"
          title={recipe.title}
          tile
          imageUrl={recipe.imageUrl}
          dish={recipe.dish}
          meta={recipeMetaText(recipe.totalMinutes, recipe.originalServings)}
          byline={sharedFromText(recipe.householdName)}
          href={sharedRecipeHref(recipe.id)}
          badge={recipe.savedCopyId ? <SavedBadge /> : undefined}
        />
      ))}
    </ul>
  );
}

/** Delade as the compact list: "25 min · 4 port. · från Bergs", and "Sparat" for one saved. */
export function SharedRecipeCompactList({ recipes }: { recipes: readonly SharedListItem[] }) {
  return (
    <ListGroup label="Delade recept" className="[&>li]:border-b-0">
      {recipes.map((recipe) => {
        const time = recipeTimeText(recipe.totalMinutes);
        return (
          <ListRow
            key={recipe.id}
            data-testid="shared-recipe-row"
            className="min-h-[72px] [&>a]:pl-3 [&>div:first-child]:pl-3"
            href={sharedRecipeHref(recipe.id)}
            title={<span className="block truncate">{recipe.title}</span>}
            meta={
              <>
                {time ? `${time} · ` : ""}
                {recipe.originalServings} port. · {sharedFromText(recipe.householdName)}
                {recipe.savedCopyId ? (
                  <>
                    {" · "}
                    <span className="font-medium text-mint-ink">Sparat</span>
                  </>
                ) : null}
              </>
            }
            leading={<RecipeImage src={recipe.imageUrl} dish={recipe.dish} title={recipe.title} artSize={44} className="size-14 rounded-[10px]" />}
          />
        );
      })}
    </ListGroup>
  );
}
