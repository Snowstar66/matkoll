import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { addToCurrentPlan } from "@/features/mealplan/server";
import { getRecipe, getRecipeWithStatus } from "@/features/recipes/server";
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

// Receptvy, with the recipe's status against the pantry. The id and the
// session are read inside <Suspense> (AD-18). An id that is not a uuid, or
// not one of the user's recipes, is "Sidan finns inte." The menu (⋯) opens
// Ändra recept, which searches the catalog. "Lägg på matsedeln" adds the
// recipe to the current meal plan (Story 3.1).
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
  const found = await getRecipeWithStatus(id);
  if (!found) notFound();
  const { recipe, status } = found;
  return (
    <RecipeView
      recipe={recipe}
      status={status}
      menu={<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />}
      addToPlan={addToCurrentPlan}
    />
  );
}
