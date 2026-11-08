import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { addToCurrentPlan, removePlanRecipe } from "@/features/mealplan/server";
import { NutritionCard, recipeNutrition, type RecipeNutrition } from "@/features/nutrition";
import { getIngredientNutrition } from "@/features/nutrition/server";
import { addKeyedItems, removeKeyedItems } from "@/features/shopping/server";
import type { SavedRecipe } from "@/features/recipes";
import { getRecipe, getRecipeSavers, getRecipeSharing, getRecipeWithPantry } from "@/features/recipes/server";
import { MarkCookedButton } from "@/features/mealplan/ui/mark-cooked-button";
import { RecipeMenu } from "@/features/recipes/ui/recipe-menu";
import { RecipeView } from "@/features/recipes/ui/recipe-view";
import { readLineOffers, readListedIds, readPlanWeeks } from "../recipe-page-data";

/** The tab shows the recipe's title; "Recept" when there is none to show. */
export async function generateMetadata({ params }: PageProps<"/recept/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const recipe = await getRecipe(id);
    return { title: recipe?.title ?? "Recept" };
  } catch {
    return { title: "Recept" };
  }
}

/**
 * The recipe's nutrition per portion (Näring), counted with the recipe's own servings; `null` when
 * the nutrition table cannot be read: no card then. Whether it shows is Tillval "Visa näring", chosen in the browser.
 */
async function readNutrition(recipe: SavedRecipe): Promise<RecipeNutrition | null> {
  try {
    const ids = [...new Set(recipe.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))];
    return recipeNutrition(recipe.lines, await getIngredientNutrition(ids), recipe.servings);
  } catch (error) {
    console.error("recipe_nutrition_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}

/**
 * The nutrition card, read under its own <Suspense>, so the recipe does not wait for the nutrition
 * (the option is chosen in the browser, so everyone's server reads it).
 */
async function NutritionCardLoader({ recipe }: { recipe: SavedRecipe }) {
  const nutrition = await readNutrition(recipe);
  return nutrition ? <NutritionCard recipeTitle={recipe.title} nutrition={nutrition} /> : null;
}

/** Delade recept: who saved a copy of the recipe, while it is shared ("Sparat av …"); none when it cannot be read. */
async function readSavers(recipe: SavedRecipe): Promise<string[]> {
  if (!recipe.isShared) return [];
  try {
    return await getRecipeSavers(recipe.id);
  } catch (error) {
    console.error("recipe_savers_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return [];
  }
}

/** Delade recept: whether sharing this recipe should first ask for a household name (only read for a recipe that is not shared yet). */
async function readNameIsDefault(recipe: SavedRecipe): Promise<boolean> {
  if (recipe.isShared) return false;
  try {
    return (await getRecipeSharing()).nameIsDefault;
  } catch (error) {
    console.error("recipe_sharing_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}

// Receptvy, with the portion selector and the status against the pantry for
// the chosen servings, counted in the browser from the pantry snapshot. A
// pantry that cannot be read leaves the recipe without status. The id and the
// session are read inside <Suspense> (AD-18). An id that is not a uuid, or
// not one of the user's recipes, is "Sidan finns inte." The menu (⋯) opens
// Ändra recept, which searches the catalog, and shares the recipe (Delade
// recept). "Lägg på matsedeln" adds the
// recipe to the current meal plan with the chosen servings, without a day
// (Story 3.1, 4.1, 25.1); "Köp det som saknas" puts only the missing
// ingredients on the shopping list (keyed items). Rows say hemma, Saknas or På
// listan and show the offer, from the offers and the list read here.
export default function RecipePage({ params }: PageProps<"/recept/[id]">) {
  return (
    <Suspense fallback={null}>
      <RecipeContent params={params} />
    </Suspense>
  );
}

async function RecipeContent({ params }: Pick<PageProps<"/recept/[id]">, "params">) {
  const { id } = await params;
  await requireUserOrRedirect(`/recept/${encodeURIComponent(id)}`);
  const [found, offers, listedIds] = await Promise.all([getRecipeWithPantry(id), readLineOffers(), readListedIds()]);
  if (!found) notFound();
  const { recipe, snapshot, site, staples } = found;
  const [{ weeks, remembered, plan }, savers, nameIsDefault] = await Promise.all([readPlanWeeks(recipe.id), readSavers(recipe), readNameIsDefault(recipe)]);
  // Whether the recipe is on the current meal plan, which "Ta bort recept" says.
  const onMenu = plan?.recipes.some((dish) => dish.recipeId === recipe.id) ?? false;
  // The dish that is not cooked yet: "Markera som lagad" under the steps (Story 13.4).
  const dish = plan?.recipes.find((candidate) => candidate.recipeId === recipe.id && !candidate.cookedAt);
  const names = Object.fromEntries(
    recipe.lines.flatMap((line) => (line.ingredientId && line.ingredientName ? [[line.ingredientId, line.ingredientName]] : [])),
  );
  return (
    <RecipeView
      recipe={recipe}
      snapshot={snapshot}
      site={site}
      staples={staples}
      menu={<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} onMenu={onMenu} nameIsDefault={nameIsDefault} />}
      addToPlan={addToCurrentPlan}
      offers={offers}
      listedIds={listedIds}
      weeks={weeks}
      defaultWeekStart={remembered}
      buyMissing={addKeyedItems}
      undoBuy={removeKeyedItems}
      removeFromPlan={removePlanRecipe}
      savers={savers}
      nutritionCard={
        <Suspense fallback={null}>
          <NutritionCardLoader recipe={recipe} />
        </Suspense>
      }
      finish={
        dish ? (
          <MarkCookedButton
            dish={{ id: dish.id, title: dish.recipeTitle, servings: dish.servings }}
            recipeId={recipe.id}
            originalServings={recipe.servings}
            lines={recipe.lines}
            snapshot={snapshot}
            siteId={site?.id ?? null}
            names={names}
            variant="primary"
            fullWidth
          />
        ) : undefined
      }
    />
  );
}
