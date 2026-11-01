import type { ReactNode } from "react";
import { BackLink } from "@/components/app-shell/back-link";
import { ChevronLeftIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import type { PlanningTarget } from "@/features/mealplan";
import type { PantrySnapshot, SelectedSite } from "@/features/pantry";
import { dishEmoji, offerSavedText } from "../domain/dish-emoji";
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
   * The place the snapshot is of, for the line "Boende: Stugan" under "X av Y
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
  /** "Markera som lagad" for the recipe's dish, shown at the end of the step mode (Story 13.4). */
  finish?: ReactNode;
  /** Planning mode (Story 13.8): "Lägg på matsedeln" becomes "Lägg på onsdag". */
  planning?: PlanningTarget;
};

export function RecipeView({ recipe, snapshot, site = null, menu, addToPlan, finish, planning }: RecipeViewProps) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  // The portion selector shows the servings, so the meta line is only the time.
  const time = recipeTimeText(recipe.totalMinutes);
  const offerLine = offerSavedText(recipe.offerNames);
  return (
    <article className="flex flex-col gap-5 pb-gutter desktop:gap-6 desktop:ml-[calc((100%-var(--frame-recipes-w))/2)] desktop:w-(--frame-recipes-w) desktop:max-w-none">
      <div className="relative -mx-page desktop:mx-0 desktop:mt-10">
        <RecipeImage
          src={recipe.imageUrl}
          emoji={dishEmoji(recipe.title)}
          iconSize={96}
          className="h-[260px] desktop:h-[320px] desktop:rounded-lg"
        />
        {/* At every width: Matkoll on the home screen has no browser back button (AD-27).
            Back in history when opened within Matkoll (from Matsedel, say), else to Recept.
            Round glass buttons on the photo: 40 px visible, 44 px tap area (Story 19.6). */}
        <BackLink
          fallbackHref="/recept"
          aria-label="Tillbaka"
          className="absolute top-[max(calc(var(--header-top-mobile)-2px),calc(env(safe-area-inset-top)+10px))] left-[calc(var(--gutter-page)-2px)] flex size-tap items-center justify-center desktop:top-1 desktop:left-1"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-glass text-ink backdrop-blur-md">
            <ChevronLeftIcon size={22} />
          </span>
        </BackLink>
        <div className="absolute top-[max(calc(var(--header-top-mobile)-2px),calc(env(safe-area-inset-top)+10px))] right-[calc(var(--gutter-page)-2px)] flex desktop:top-1 desktop:right-1">
          <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} glass="large" />
          {menu}
        </div>
      </div>

      <header className="flex flex-col gap-1.5">
        <h1 className="min-w-0 text-recipe-title wrap-break-word text-ink">{recipe.title}</h1>
        <p className="text-meta text-ink-2" data-testid="recipe-meta">
          {time ? <span>{time}</span> : null}
          {time ? " · " : ""}
          {recipe.sourceKind === "url" && recipe.sourceUrl ? (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2"
            >
              {source}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> (öppnas i ny flik)</span>
            </a>
          ) : (
            source
          )}
        </p>
        {offerLine ? (
          <p className="text-meta text-ink-2" data-testid="recipe-offers">
            {offerLine}
          </p>
        ) : null}
      </header>

      <RecipeBody
        key={servingsVersion(recipe)}
        recipe={recipe}
        snapshot={snapshot}
        site={site}
        addToPlan={addToPlan}
        finish={finish}
        planning={planning}
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
