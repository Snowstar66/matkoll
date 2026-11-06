import type { ReactNode } from "react";
import { BackLink } from "@/components/app-shell/back-link";
import { ChevronLeftIcon } from "@/components/icons";
import { RecipeImage } from "@/components/recipe-image";
import type { PantrySnapshot, SelectedSite, StapleRules } from "@/features/pantry";
import { offerSavedText } from "../domain/dish-emoji";
import type { LineOffer } from "../domain/line-status";
import { recipeTimeText } from "../domain/recipe-list";
import type { SavedRecipe } from "../domain/saved-recipe";
import { sourceLabel } from "../domain/source-label";
import { FavoriteButton } from "./favorite-button";
import { RecipeBody, type AddToPlan, type BuyMissing, type PlanDishInfo, type RecipeWeek, type SetDishWeekday, type UndoBuy } from "./recipe-body";

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
  /** This week and the next two with the recipe's dish on each (the week picker; next week first). */
  weeks?: readonly RecipeWeek[];
  /** The recipe's dish on this week's plan, or `null`; used without `weeks`. */
  dish?: PlanDishInfo | null;
  /** shopping.addKeyedItems and removeKeyedItems: "Köp det som saknas" and its "Ångra". */
  buyMissing?: BuyMissing;
  undoBuy?: UndoBuy;
  /** mealplan.setWeekday: "Välj dag" / "Byt dag". */
  setWeekday?: SetDishWeekday;
  /** "Markera som lagad" for the recipe's dish, shown under the steps (Story 13.4). */
  finish?: ReactNode;
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
  buyMissing,
  undoBuy,
  setWeekday,
  finish,
}: RecipeViewProps) {
  const source = sourceLabel(recipe.sourceKind, recipe.sourceUrl);
  // The portion selector shows the servings, so the meta line is only the time.
  const time = recipeTimeText(recipe.totalMinutes);
  const offerLine = offerSavedText(recipe.offerNames);
  return (
    <article className="flex flex-col gap-5 pb-gutter desktop:gap-6 desktop:ml-[calc((100%-var(--frame-recipes-w))/2)] desktop:w-(--frame-recipes-w) desktop:max-w-none">
      {/* A compact top bar instead of a big picture (Pontus 2026-11-06): back on the left, the heart and ⋯ on the right.
          Matkoll on the home screen has no browser back button (AD-27): back in history when opened within Matkoll, else to Recept. */}
      <div className="flex items-center justify-between pt-[max(calc(var(--header-top-mobile)-2px),calc(env(safe-area-inset-top)+10px))] desktop:mt-10 desktop:pt-0">
        <BackLink fallbackHref="/recept" aria-label="Tillbaka" className="-ml-2 flex size-tap items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-surface text-ink">
            <ChevronLeftIcon size={22} />
          </span>
        </BackLink>
        <div className="-mr-2 flex">
          <FavoriteButton id={recipe.id} isFavorite={recipe.isFavorite} glass="large" />
          {menu}
        </div>
      </div>

      <header className="flex items-center gap-3.5">
        <RecipeImage src={recipe.imageUrl} iconSize={26} className="size-[72px] shrink-0 rounded-lg" />
        <div className="flex min-w-0 flex-col gap-1.5">
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
        setWeekday={setWeekday}
        finish={finish}
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
