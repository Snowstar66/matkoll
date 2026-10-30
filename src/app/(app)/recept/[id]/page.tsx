import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { planningTarget } from "@/features/mealplan";
import { addToCurrentPlan, getCurrentPlan } from "@/features/mealplan/server";
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

// Receptvy, with the portion selector and the status against the pantry for
// the chosen servings, counted in the browser from the pantry snapshot. A
// pantry that cannot be read leaves the recipe without status. The id and the
// session are read inside <Suspense> (AD-18). An id that is not a uuid, or
// not one of the user's recipes, is "Sidan finns inte." The menu (⋯) opens
// Ändra recept, which searches the catalog. "Lägg på matsedeln" adds the
// recipe to the current meal plan with the chosen servings (Story 3.1, 4.1).
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
  const found = await getRecipeWithPantry(id);
  if (!found) notFound();
  const { recipe, snapshot, site } = found;
  // Whether the recipe is on the current meal plan, which "Ta bort recept" says.
  const plan = await getCurrentPlan().catch(() => null);
  const onMenu = plan?.recipes.some((dish) => dish.recipeId === recipe.id) ?? false;
  // The dish that is not cooked yet: "Markera som lagad" at the end of the step mode (Story 13.4).
  const dish = plan?.recipes.find((candidate) => candidate.recipeId === recipe.id && !candidate.cookedAt);
  const names = Object.fromEntries(
    recipe.lines.flatMap((line) => (line.ingredientId && line.ingredientName ? [[line.ingredientId, line.ingredientName]] : [])),
  );
  return (
    <RecipeView
      recipe={recipe}
      snapshot={snapshot}
      site={site}
      menu={<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} onMenu={onMenu} />}
      addToPlan={addToCurrentPlan}
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
