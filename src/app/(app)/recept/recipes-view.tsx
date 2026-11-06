import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { matchOffersWithAi, recipeOfferTags } from "@/features/suggestions/server";
import { offerDisplay, recipeOffersLineText } from "@/features/offers";
import { loadOffersSheetData } from "../offers-sheet-data";
import { RecipeOffersSheet } from "./recipe-offers-sheet";
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
export function RecipesView({ autoImport }: { autoImport?: AutoImport }) {
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
        <RecipesContent />
      </Suspense>
      </div>
    </ImportRecipeProvider>
  );
}

async function RecipesContent() {
  await requireUserOrRedirect("/recept");
  const [{ recipes, pantryUnavailable, site }, offers] = await Promise.all([listLibrary(), readLibraryOffers()]);
  if (recipes.length === 0) {
    return (
      <>
        <EmptyState action={<ImportRecipeButton variant="primary" />}>
          Inga recept än. Klistra in en länk till ett recept du gillar.
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
    const labelled = await recipeOfferTags(offers);
    const tags: Record<string, string[]> = {};
    for (const [id, labels] of Object.entries(labelled)) tags[id] = [...new Set(labels.map((label) => offerDisplay(label).title))];
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
