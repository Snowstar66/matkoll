import type { ReactNode } from "react";
import { currentWeekStart } from "@/features/mealplan";
import { addToCurrentPlan, getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
import { CatalogDataError, searchIngredients } from "@/features/catalog/server";
import { OffersDataError } from "@/features/offers/server";
import { RecipeDataError } from "@/features/recipes/server";
import { SettingsDataError } from "@/features/settings/server";
import { PantryDataError } from "@/features/pantry/server";
import { optionsForTab } from "@/features/suggestions";
import { isOfferIdeaError, loadOfferIdeas, readOfferIdeas, startOfferIdeas, weekPlanOptions } from "@/features/suggestions/server";
import { OfferDishesCard } from "./offer-dishes-card";

/** At most this many dishes are shown at the top of Veckans erbjudanden. */
const maxOfferDishes = 3;

/**
 * "Rätter med extrapris" for the top of the sheet Veckans erbjudanden, as a
 * slot (route → ui, AD-1: the offers module never imports mealplan, suggestions
 * or recipes). The dishes are the same as Matsedel's tab "På erbjudande"
 * (weekPlanOptions and optionsForTab, most saved first), the first three, and
 * under them "Nya idéer" (saved, prepared in the background), so the card is there whenever the
 * sheet has offers, also without a matching dish. `null` when the dishes
 * cannot be read (logged, never thrown): the sheet is then shown without the card.
 */
export async function loadOfferDishes(): Promise<ReactNode> {
  try {
    const weekStart = currentWeekStart();
    const [options, view] = await Promise.all([weekPlanOptions(), getMealPlanView(weekStart)]);
    const dishes = optionsForTab(options, "offers").slice(0, maxOfferDishes);
    const onWeek: Record<string, number | null> = {};
    for (const dish of view.dishes) if (dish.recipeId && !(dish.recipeId in onWeek)) onWeek[dish.recipeId] = dish.weekday ?? null;
    // The saved ideas, prepared in the background; a set that cannot be read leaves the card without them.
    const ideas = await loadOfferIdeas().catch((error: unknown) => {
      if (!isOfferIdeaError(error)) throw error;
      console.error("offer_ideas_unavailable", { reason: "detail" in error ? error.detail : "recipes" });
      return null;
    });
    return (
      <OfferDishesCard
        dishes={dishes}
        onWeek={onWeek}
        weekStart={weekStart}
        addToWeek={addToCurrentPlan}
        searchIngredients={searchIngredients}
        ideas={ideas}
        startIdeas={startOfferIdeas}
        readIdeas={readOfferIdeas}
      />
    );
  } catch (error) {
    if (
      !(
        error instanceof RecipeDataError ||
        error instanceof OffersDataError ||
        error instanceof SettingsDataError ||
        error instanceof CatalogDataError ||
        error instanceof PantryDataError ||
        error instanceof MealPlanDataError
      )
    )
      throw error;
    console.error("offer_dishes_unavailable", { reason: error instanceof CatalogDataError ? error.code : error.detail });
    return null;
  }
}
