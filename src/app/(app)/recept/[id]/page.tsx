import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { getRecipe } from "@/features/recipes/server";
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

// Receptvy. The id and the session are read inside <Suspense> (AD-18). An id
// that is not a uuid, or not one of the user's recipes, is "Sidan finns inte."
// The menu (⋯) opens Ändra recept, which searches the catalog.
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
  const recipe = await getRecipe(id);
  if (!recipe) notFound();
  return <RecipeView recipe={recipe} menu={<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />} />;
}
