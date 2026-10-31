import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { SettingsIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { searchIngredients } from "@/features/catalog/server";
import { addToCurrentPlan } from "@/features/mealplan/server";
import { ownRecipesWithOffers } from "@/features/suggestions/server";
import { listRecipeSites } from "@/features/settings/server";
import { listLibrary } from "@/features/recipes/server";
import { type AutoImport, ImportRecipeButton, ImportRecipeProvider } from "@/features/recipes/ui/import-sheet";
import { PlanningBar } from "@/features/mealplan/ui/planning-bar";
import { planningTarget } from "@/features/mealplan";
import { ImportFailures } from "@/features/recipes/ui/saved-imports";
import { Library } from "@/features/recipes/ui/library";
import { WarmAi } from "../warm-ai";


// Receptbiblioteket. The list is read inside <Suspense> (AD-18), with skeleton
// rows while it loads; without recipes the page shows the empty state. "+" in
// the header and "Importera recept" in the empty state open the same sheet.
// AI-förslag are in the library's filter Kan lagas nu, so an empty library
// offers import only. Story 12.2: when the page is shown, WarmAi asks the
// server to wake the model for AI-förslag, without waiting for the list.
export function RecipesView({
  autoImport,
  searchParams,
}: {
  autoImport?: AutoImport;
  /** `?planera=2026-11-04`: Recept in planning mode for that day (Story 13.8). */
  searchParams?: Promise<{ planera?: string | string[] }>;
}) {
  // Story 1.14: waited for inside the import sheet; a failure shows the "no sites" line.
  const sites = listRecipeSites().catch((): string[] => []);
  return (
    <ImportRecipeProvider autoImport={autoImport} sites={sites}>
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
      <ImportFailures />
      <Suspense fallback={<Skeleton rows={4} />}>
        <RecipesContent searchParams={searchParams} />
      </Suspense>
    </ImportRecipeProvider>
  );
}

async function RecipesContent({ searchParams }: { searchParams?: Promise<{ planera?: string | string[] }> }) {
  await requireUserOrRedirect("/recept");
  const planera = (await searchParams)?.planera;
  const planning = planningTarget(Array.isArray(planera) ? planera[0] : planera);
  const { recipes, pantryUnavailable, site } = await listLibrary();
  if (recipes.length === 0) {
    return (
      <>
        {planning ? <PlanningBar target={planning} /> : null}
        <EmptyState action={<ImportRecipeButton variant="primary" />}>
          Inga recept än. Klistra in en länk till ett recept du gillar.
        </EmptyState>
      </>
    );
  }
  return (
    <>
    {planning ? <PlanningBar target={planning} /> : null}
    <Library
      recipes={recipes}
      pantryUnavailable={pantryUnavailable}
      site={site}
      searchIngredients={searchIngredients}
      addToPlan={addToCurrentPlan}
      ownRecipes={ownRecipesWithOffers}
      planning={planning ?? undefined}
    />
    </>
  );
}
