import type { ReactNode } from "react";
import { BackLink } from "@/components/app-shell/back-link";
import { ChevronLeftIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import { dishKind } from "@/lib/dish-kind";
import type { PantrySnapshot, SelectedSite, StapleRules } from "@/features/pantry";
import { offerSavedText } from "../domain/offer-saved";
import type { LineOffer } from "../domain/line-status";
import { recipeTimeText } from "../domain/recipe-list";
import type { SavedRecipe } from "../domain/saved-recipe";
import { savedByText, sharedByText } from "../domain/shared-recipe";
import { sourceLabel } from "../domain/source-label";
import { FavoriteButton } from "./favorite-button";
import { RecipeBody, type AddToPlan, type BuyMissing, type PlanDishInfo, type RecipeWeek, type RemoveFromPlan, type UndoBuy } from "./recipe-body";

// Receptvy (FR-20): the same look whatever the source, with the heart (FR-9)
// and the menu (⋯, Story 1.11) beside the title, the time and the source
// under it, and then the part that follows the chosen servings (RecipeBody):
// the portion selector with the status and "X av Y hemma", the ingredients
// with their status each (Story 2.4, 25.1), the steps, and the bottom bar with
// "Köp det som saknas" and "Lägg på matsedeln" (Story 3.1, 25.1).

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
  /** The household's Basvaror, which count as at home (pantry.isStaple); none when left out. */
  staples?: StapleRules;
  /** The menu (⋯) with "Ändra", from the page, which has what its form needs. */
  menu?: ReactNode;
  /**
   * mealplan.addToCurrentPlan from the page (AD-1): with it, the view has
   * "Lägg på matsedeln" pinned to the bottom (Story 3.1).
   */
  addToPlan?: AddToPlan;
  /** The best offer per catalog ingredient (recipes.lineOffers), shown on the rows that are missing. */
  offers?: Record<string, LineOffer>;
  /** The catalog ingredients on the shopping list now ("På listan"). */
  listedIds?: readonly string[];
  /** This week and the next two (and the remembered week) with the recipe's dish on each. */
  weeks?: readonly RecipeWeek[];
  /** The Monday "Lägg på matsedeln" puts the dish on (the remembered week, UX-04). */
  defaultWeekStart?: string;
  /** The recipe's dish on this week's plan, or `null`; used without `weeks`. */
  dish?: PlanDishInfo | null;
  /** shopping.addKeyedItems and removeKeyedItems: "Köp det som saknas" and its "Ångra". */
  buyMissing?: BuyMissing;
  undoBuy?: UndoBuy;
  /** mealplan.removePlanRecipe: "Ångra" after "Lägg på matsedeln", and "Byt vecka". */
  removeFromPlan?: RemoveFromPlan;
  /** "Markera som lagad" for the recipe's dish, shown under the steps (Story 13.4). */
  finish?: ReactNode;
  /** The nutrition card (nutrition.NutritionCard) from the page, between the chips and Ingredienser. */
  nutritionCard?: ReactNode;
  /** The heart beside the menu; left out (false) on another household's shared recipe. */
  withFavorite?: boolean;
  /**
   * Delade recept: the households that saved a copy of this own, shared recipe, for "Sparat av
   * Lindqvists och Bergs" under the time (only while it is shared).
   */
  savers?: readonly string[];
  /** Delade recept: the household that shares the recipe shown ("Delat av Lindqvists"); a saved copy says it by itself. */
  sharedBy?: string;
  /** "Köp det som saknas (N)" as a text button beside the portion selector instead of in the bottom bar (a shared recipe). */
  buyInline?: boolean;
  /** A button first in the bottom bar ("Spara i mina recept" on a shared recipe). */
  extraAction?: ReactNode;
};

export function RecipeView({
  recipe,
  snapshot,
  site = null,
  staples,
  menu,
  addToPlan,
  offers,
  listedIds,
  dish,
  weeks,
  defaultWeekStart,
  buyMissing,
  undoBuy,
  removeFromPlan,
  finish,
  nutritionCard,
  withFavorite = true,
  savers = [],
  sharedBy,
  buyInline = false,
  extraAction,
}: RecipeViewProps) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  // The portion selector shows the servings, so the meta line is only the time.
  const time = recipeTimeText(recipe.totalMinutes);
  const offerLine = offerSavedText(recipe.offerNames);
  const sharedFrom = sharedBy ?? recipe.sharedFromName ?? null;
  const savedBy = recipe.isShared ? savedByText(savers) : null;
  return (
    <article className="flex flex-col gap-5 pb-gutter desktop:gap-6 desktop:ml-[calc((100%-var(--frame-recipes-w))/2)] desktop:w-(--frame-recipes-w) desktop:max-w-none">
      {/* A compact top bar instead of a big picture (Pontus 2026-11-06): back on the left, the heart and ⋯ on the right.
          Matkoll on the home screen has no browser back button (AD-27): back in history when opened within Matkoll, else to Recept. */}
      <div className="flex items-center justify-between pt-[max(calc(var(--header-top-mobile)-2px),calc(env(safe-area-inset-top)+10px))] desktop:mt-10 desktop:pt-0">
        {/* UX-26: the same back link as every page: an arrow and the parent's name. */}
        <BackLink fallbackHref="/recept" className="-ml-2 flex min-h-tap min-w-tap items-center gap-1 rounded-md px-2 text-body text-accent">
          <ChevronLeftIcon size={20} />
          Recept
        </BackLink>
        <div className="-mr-2 flex">
          {withFavorite ? <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} glass="large" /> : null}
          {menu}
        </div>
      </div>

      <header className="flex items-center gap-3.5">
        <RecipeImage
          src={recipe.imageUrl}
          dish={dishKind(recipe.title, recipe.lines.map((line) => line.originalText))}
          artSize={56}
          className="size-[72px] shrink-0 rounded-lg"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="min-w-0 text-recipe-title wrap-break-word text-ink">{recipe.title}</h1>
        {/* UX-12: the source is shown only when it is a link; "Inklistrad text" is not something to press. */}
        {time || (recipe.sourceKind === "url" && recipe.sourceUrl) ? (
          <p className="text-meta text-ink-2" data-testid="recipe-meta">
            {time ? <span>{time}</span> : null}
            {time && recipe.sourceKind === "url" && recipe.sourceUrl ? " · " : ""}
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
            ) : null}
          </p>
        ) : null}
        {sharedFrom ? (
          <p className="text-meta text-ink-2" data-testid="recipe-shared-by">
            {sharedByText(sharedFrom)}
          </p>
        ) : null}
        {savedBy ? (
          <p className="text-meta text-ink-2" data-testid="recipe-saved-by">
            {savedBy}
          </p>
        ) : null}
        {offerLine ? (
          <p className="text-meta text-ink-2" data-testid="recipe-offers">
            {offerLine}
          </p>
        ) : null}
        </div>
      </header>

      <RecipeBody
        key={servingsVersion(recipe)}
        recipe={recipe}
        snapshot={snapshot}
        site={site}
        staples={staples}
        addToPlan={addToPlan}
        offers={offers}
        listedIds={listedIds}
        dish={dish}
        weeks={weeks}
        buyMissing={buyMissing}
        undoBuy={undoBuy}
        removeFromPlan={removeFromPlan}
        defaultWeekStart={defaultWeekStart}
        finish={finish}
        nutritionCard={nutritionCard}
        shared={recipe.isShared ?? false}
        buyInline={buyInline}
        extraAction={extraAction}
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
