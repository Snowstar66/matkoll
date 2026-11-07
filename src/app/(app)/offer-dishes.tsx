import type { ReactNode } from "react";
import { copyTargets, weekNumber } from "@/features/mealplan";
import { addToCurrentPlan, getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
import { CatalogDataError, searchIngredients } from "@/features/catalog/server";
import { OffersDataError } from "@/features/offers/server";
import { RecipeDataError } from "@/features/recipes/server";
import { SettingsDataError } from "@/features/settings/server";
import { PantryDataError } from "@/features/pantry/server";
import { optionsForTab } from "@/features/suggestions";
import { isOfferIdeaError, loadOfferIdeas, readOfferIdeas, startOfferIdeas, weekPlanOptions } from "@/features/suggestions/server";
import { offerTagOf, type OfferTagData } from "@/lib/offer-tag";
import type { StoreOffer } from "@/features/offers";
import { OfferDishesCard, type OfferWeek } from "./offer-dishes-card";

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
export async function loadOfferDishes(offers: readonly StoreOffer[] = []): Promise<ReactNode> {
  try {
    // This week and the next two (the week picker), each with the dishes already on it.
    const targets = copyTargets();
    const [options, ...views] = await Promise.all([weekPlanOptions(), ...targets.map((target) => getMealPlanView(target.weekStart))]);
    const dishes = optionsForTab(options, "offers").slice(0, maxOfferDishes);
    const weeks: OfferWeek[] = targets.map((target, index) => {
      const onWeek: Record<string, number | null> = {};
      for (const dish of views[index]?.dishes ?? []) if (dish.recipeId && !(dish.recipeId in onWeek)) onWeek[dish.recipeId] = dish.weekday ?? null;
      return { weekStart: target.weekStart, offset: target.offset, number: weekNumber(target.weekStart), onWeek };
    });
    // The saved ideas, prepared in the background; a set that cannot be read leaves the card without them.
    const ideas = await loadOfferIdeas().catch((error: unknown) => {
      if (!isOfferIdeaError(error)) throw error;
      console.error("offer_ideas_unavailable", { reason: "detail" in error ? error.detail : "recipes" });
      return null;
    });
    // UX-20: the ideas only know the labels of the offers they use; the tags need the name and the price.
    const tagsByLabel: Record<string, OfferTagData> = {};
    for (const offer of offers) if (!Object.hasOwn(tagsByLabel, offer.label)) tagsByLabel[offer.label] = offerTagOf(offer);
    return (
      <OfferDishesCard
        dishes={dishes}
        weeks={weeks}
        addToWeek={addToCurrentPlan}
        searchIngredients={searchIngredients}
        ideas={ideas}
        startIdeas={startOfferIdeas}
        readIdeas={readOfferIdeas}
        tagsByLabel={tagsByLabel}
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
