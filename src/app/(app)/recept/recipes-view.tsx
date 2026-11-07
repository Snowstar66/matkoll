import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { matchOffersWithAi, recipeOfferTags } from "@/features/suggestions/server";
import { recipeOffersLineText } from "@/features/offers";
import { loadOffersSheetData } from "../offers-sheet-data";
import { RecipeOffersSheet } from "./recipe-offers-sheet";
import { getCurrentPlan } from "@/features/mealplan/server";
import { listRecipeSites } from "@/features/settings/server";
import { listLibrary } from "@/features/recipes/server";
import { type AutoImport, ImportRecipeButton, ImportRecipeProvider } from "@/features/recipes/ui/import-sheet";
import { ImportFailures } from "@/features/recipes/ui/saved-imports";
import { Library, type LibraryOffers } from "@/features/recipes/ui/library";
import { WarmAi } from "../warm-ai";


// Receptbiblioteket. The list is read inside <Suspense> (AD-18), with skeleton
// rows while it loads; without recipes the page shows the empty state. "+" in
// the header and "Importera recept" in the empty state open the same sheet.
// Story 25.3: the AI ideas moved to Matsedel (På erbjudande). Story 12.2:
// when the page is shown, WarmAi asks the server to wake the model for
// recipe import, without waiting for the list.
// `initialFilter` is a promise (the page's searchParams), awaited inside <Suspense> so the frame still prerenders.
export function RecipesView({ autoImport, initialFilter }: { autoImport?: AutoImport; initialFilter?: Promise<"offers" | undefined> }) {
  // Story 1.14: waited for inside the import sheet; a failure shows the "no sites" line.
  const sites = listRecipeSites().catch((): string[] => []);
  return (
    <ImportRecipeProvider autoImport={autoImport} sites={sites}>
      <WarmAi kind="text" />
      {/* Story 19.6: Recept has a 960 px frame on a desktop (three columns of cards), centred on the 720 px one. */}
      <div className="flex flex-1 flex-col desktop:ml-[calc((100%-var(--frame-recipes-w))/2)] desktop:w-(--frame-recipes-w) desktop:max-w-none">
      <PageHeader
        title="Recept"
        tab="/recept"
        // Story 19.2: Inställningar is behind the P button (and at the bottom of the side menu on a desktop), so "+" is alone.
        action={<ImportRecipeButton variant="icon" />}
      />
      <ImportFailures />
      <Suspense fallback={<Skeleton rows={4} />}>
        <RecipesContent initialFilter={initialFilter} />
      </Suspense>
      </div>
    </ImportRecipeProvider>
  );
}

async function RecipesContent({ initialFilter: filterPromise }: { initialFilter?: Promise<"offers" | undefined> }) {
  await requireUserOrRedirect("/recept");
  const initialFilter = await filterPromise;
  const [{ recipes, pantryUnavailable, site }, offers, plan] = await Promise.all([
    listLibrary(),
    readLibraryOffers(),
    // Which recipes are on the current meal plan, which the question before a swipe-away delete says.
    getCurrentPlan().catch(() => null),
  ]);
  if (recipes.length === 0) {
    return (
      <>
        <EmptyState hint="Klistra in en länk till ett recept du gillar." action={<ImportRecipeButton variant="primary" />}>
          Inga recept än.
        </EmptyState>
      </>
    );
  }
  return (
    <>
    <Library
      recipes={recipes}
      pantryUnavailable={pantryUnavailable}
      site={site}
      offers={offers}
      onMenuIds={plan?.recipes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])) ?? []}
      initialFilter={offers ? initialFilter : undefined}
    />
    </>
  );
}

/**
 * Story 9.3: the filter Erbjudanden's data, from the offers of the user's stores
 * (the sheet's, Story 9.13: the same as Inköpslista's), and what each recipe uses
 * on a main ingredient. A read that fails leaves the filter out and the library as it was.
 */
async function readLibraryOffers(): Promise<LibraryOffers | undefined> {
  try {
    const { props, offers, stores } = await loadOffersSheetData();
    if (props.unavailable) return undefined;
    const tags = await recipeOfferTags(offers);
    const storeIds = new Set(offers.map((offer) => offer.storeId));
    return {
      tags,
      line: recipeOffersLineText({
        weekStart: props.weekStart,
        storeNames: stores.filter((store) => storeIds.has(store.id)).map((store) => store.name),
      }),
      hasOffers: offers.length > 0,
      unlinked: offers.filter((offer) => offer.ingredientId === null && offer.source === "link" && !offer.aiMatchedAt).length,
      sheet: <RecipeOffersSheet {...props} />,
      match: matchOffersWithAi,
    };
  } catch (error) {
    console.error("recipe_offers_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return undefined;
  }
}
