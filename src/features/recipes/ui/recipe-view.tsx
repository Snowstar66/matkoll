import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import type { PantrySnapshot, SelectedSite } from "@/features/pantry";
import { recipeTimeText } from "../domain/recipe-list";
import type { SavedRecipe } from "../domain/saved-recipe";
import { sourceLabel } from "../domain/source-label";
import type { AddToPlan } from "./add-to-plan-button";
import { FavoriteButton } from "./favorite-button";
import { RecipeBody } from "./recipe-body";

// Receptvy (FR-20): the same look whatever the source, with the heart (FR-9)
// and the menu (⋯, Story 1.11) beside the title, the time and the source
// under it, and then the part that follows the chosen servings (RecipeBody):
// the portion selector with the status and "X av Y hemma", the ingredients
// with a tick or ring each (Story 2.4), the steps and "Lägg på matsedeln"
// (Story 3.1) and "Laga nu", which opens the step mode (Story 4.2).

export type RecipeViewProps = {
  recipe: SavedRecipe;
  /**
   * The whole pantry, for the status for the chosen servings, counted in the
   * browser; `null` when the pantry could not be read, and the recipe is
   * shown without badge, marks and "X av Y hemma".
   */
  snapshot: PantrySnapshot | null;
  /**
   * The place the snapshot is of, for the line "Lager: Stugan" under "X av Y
   * hemma" (AD-24); `null`, or left out, without a status or with one place.
   */
  site?: SelectedSite | null;
  /** The menu (⋯) with "Ändra", from the page, which has what its form needs. */
  menu?: ReactNode;
  /**
   * mealplan.addToCurrentPlan from the page (AD-1): with it, the view has
   * "Lägg på matsedeln" pinned to the bottom (Story 3.1).
   */
  addToPlan?: AddToPlan;
};

export function RecipeView({ recipe, snapshot, site = null, menu, addToPlan }: RecipeViewProps) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  // The portion selector shows the servings, so the meta line is only the time.
  const time = recipeTimeText(recipe.totalMinutes);
  return (
    <article className="flex flex-col gap-6 pb-gutter">
      <div className="relative -mx-page desktop:mx-0 desktop:mt-10">
        <RecipeImage src={recipe.imageUrl} className="h-[260px] desktop:rounded-lg" />
        {/* On desktop the side menu is always there, so no back link. */}
        <Link
          href="/recept"
          scroll={false}
          aria-label="Tillbaka till recepten"
          className="absolute top-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] left-page flex size-tap items-center justify-center rounded-full bg-surface text-ink desktop:hidden"
        >
          <ChevronLeftIcon size={20} />
        </Link>
      </div>

      <header className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="min-w-0 text-recipe-title break-words text-ink">{recipe.title}</h1>
          <div className="-mt-1 -mr-2.5 flex shrink-0">
            <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} />
            {menu}
          </div>
        </div>
        {time ? (
          <p className="text-meta text-ink-2" data-testid="recipe-meta">
            {time}
          </p>
        ) : null}
        <p className="text-meta text-ink-2">
          Källa:{" "}
          {recipe.sourceKind === "url" && recipe.sourceUrl ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
              {source}
            </a>
          ) : (
            source
          )}
        </p>
      </header>

      <RecipeBody
        key={servingsVersion(recipe)}
        recipe={recipe}
        snapshot={snapshot}
        site={site}
        addToPlan={addToPlan}
      />
    </article>
  );
}

/**
 * What the chosen servings are counted from: the recipe's servings and its
 * lines' amounts. A saved edit of either starts the portion selector again
 * from the recipe's own servings; anything else that changes the recipe (the
 * heart, the title, the steps, a new updatedAt) or the pantry keeps the choice.
 */
function servingsVersion(recipe: SavedRecipe): string {
  const lines = recipe.lines.map((line) => [line.id, line.ingredientId, line.amount, line.unit, line.isVague]);
  return JSON.stringify([recipe.servings, lines]);
}
