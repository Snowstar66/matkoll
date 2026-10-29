import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { SettingsIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { addToCurrentPlan, getCurrentPlan } from "@/features/mealplan/server";
import { ownRecipesWithOffers } from "@/features/suggestions/server";
import { listLibrary } from "@/features/recipes/server";
import { ImportRecipeButton, ImportRecipeProvider } from "@/features/recipes/ui/import-sheet";
import { Library } from "@/features/recipes/ui/library";
import { WarmAi } from "../warm-ai";

export const metadata: Metadata = { title: "Recept" };

// Receptbiblioteket. The list is read inside <Suspense> (AD-18), with skeleton
// rows while it loads; without recipes the page shows the empty state. "+" in
// the header and "Importera recept" in the empty state open the same sheet.
// AI-förslag are in the library's filter Kan lagas nu, so an empty library
// offers import only. Story 12.2: when the page is shown, WarmAi asks the
// server to wake the model for AI-förslag, without waiting for the list.
export default function RecipesPage() {
  return (
    <ImportRecipeProvider searchIngredients={searchIngredients}>
      <WarmAi kind="text" />
      <PageHeader
        title="Recept"
        action={
          <>
            <ImportRecipeButton variant="icon" />
            {/* On desktop, Inställningar is at the bottom of the side menu instead. */}
            <Link
              href="/installningar"
              scroll={false}
              aria-label="Inställningar"
              className="flex size-tap items-center justify-center rounded-full text-ink-2 desktop:hidden"
            >
              <SettingsIcon size={24} />
            </Link>
          </>
        }
      />
      <Suspense fallback={<Skeleton rows={4} />}>
        <RecipesContent />
      </Suspense>
    </ImportRecipeProvider>
  );
}

async function RecipesContent() {
  await requireUserOrRedirect("/recept");
  const { recipes, pantryUnavailable, site } = await listLibrary();
  const plan = await getCurrentPlan().catch(() => null);
  const onMenuIds = (plan?.recipes ?? []).flatMap((dish) => (dish.recipeId ? [dish.recipeId] : []));
  if (recipes.length === 0) {
    return (
      <EmptyState action={<ImportRecipeButton variant="primary" />}>
        Inga recept än. Klistra in en länk till ett recept du gillar.
      </EmptyState>
    );
  }
  return (
    <Library
      recipes={recipes}
      pantryUnavailable={pantryUnavailable}
      site={site}
      searchIngredients={searchIngredients}
      addToPlan={addToCurrentPlan}
      ownRecipes={ownRecipesWithOffers}
      onMenuIds={onMenuIds}
    />
  );
}
