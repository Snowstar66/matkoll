import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { planningTarget } from "@/features/mealplan";
import { addToCurrentPlan, getCurrentPlan, setWeekday } from "@/features/mealplan/server";
import { getActiveOffers } from "@/features/offers/server";
import { lineOffers, type LineOffer } from "@/features/recipes";
import { listStores } from "@/features/settings/server";
import { addKeyedItems, getShoppingList, removeKeyedItems } from "@/features/shopping/server";
import { getRecipe, getRecipeWithPantry } from "@/features/recipes/server";
import { MarkCookedButton } from "@/features/mealplan/ui/mark-cooked-button";
import { RecipeMenu } from "@/features/recipes/ui/recipe-menu";
import { RecipeView } from "@/features/recipes/ui/recipe-view";

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
 * The best offer per catalog ingredient from this week's offers in all the
 * user's stores (Story 9.13, 25.1); none when the stores or offers cannot be read.
 */
async function readLineOffers(): Promise<Record<string, LineOffer>> {
  try {
    const stores = await listStores();
    const offers = (await Promise.all(stores.map((store) => getActiveOffers(store.id)))).flat();
    return lineOffers(offers, new Map(stores.map((store) => [store.id, store.name])));
  } catch (error) {
    console.error("recipe_offers_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return {};
  }
}

/** The catalog ingredients on the shopping list now, for "På listan"; none when the list cannot be read. */
async function readListedIds(): Promise<string[]> {
  try {
    const list = await getShoppingList();
    if (!list.ok) return [];
    return [...new Set(list.data.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))];
  } catch (error) {
    console.error("recipe_list_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return [];
  }
}

// Receptvy, with the portion selector and the status against the pantry for
// the chosen servings, counted in the browser from the pantry snapshot. A
// pantry that cannot be read leaves the recipe without status. The id and the
// session are read inside <Suspense> (AD-18). An id that is not a uuid, or
// not one of the user's recipes, is "Sidan finns inte." The menu (⋯) opens
// Ändra recept, which searches the catalog. "Lägg på matsedeln" adds the
// recipe to the current meal plan with the chosen servings, without a day
// (Story 3.1, 4.1, 25.1); "Köp det som saknas" puts only the missing
// ingredients on the shopping list (keyed items). Rows say hemma, Saknas or På
// listan and show the offer, from the offers and the list read here.
export default function RecipePage({ params, searchParams }: PageProps<"/recept/[id]">) {
  return (
    <Suspense fallback={null}>
      <RecipeContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function RecipeContent({ params, searchParams }: Pick<PageProps<"/recept/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  await requireUserOrRedirect(`/recept/${encodeURIComponent(id)}`);
  // After the session is read, which makes the page dynamic: planningTarget counts from the clock.
  const planera = (await searchParams).planera;
  const planning = planningTarget(Array.isArray(planera) ? planera[0] : planera);
  const [found, offers, listedIds] = await Promise.all([getRecipeWithPantry(id), readLineOffers(), readListedIds()]);
  if (!found) notFound();
  const { recipe, snapshot, site, staples } = found;
  // Whether the recipe is on the current meal plan, which "Ta bort recept" says.
  const plan = await getCurrentPlan().catch(() => null);
  const onMenu = plan?.recipes.some((dish) => dish.recipeId === recipe.id) ?? false;
  // The dish that is not cooked yet: "Markera som lagad" under the steps (Story 13.4).
  const dish = plan?.recipes.find((candidate) => candidate.recipeId === recipe.id && !candidate.cookedAt);
  const planned = plan?.recipes.find((candidate) => candidate.recipeId === recipe.id);
  const names = Object.fromEntries(
    recipe.lines.flatMap((line) => (line.ingredientId && line.ingredientName ? [[line.ingredientId, line.ingredientName]] : [])),
  );
  return (
    <RecipeView
      recipe={recipe}
      snapshot={snapshot}
      site={site}
      staples={staples}
      menu={<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} onMenu={onMenu} />}
      addToPlan={addToCurrentPlan}
      offers={offers}
      listedIds={listedIds}
      dish={planned ? { id: planned.id, weekday: planned.weekday ?? null } : null}
      buyMissing={addKeyedItems}
      undoBuy={removeKeyedItems}
      setWeekday={setWeekday}
      planning={planning ?? undefined}
      finish={
        dish ? (
          <MarkCookedButton
            dish={{ id: dish.id, title: dish.recipeTitle, servings: dish.servings }}
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
