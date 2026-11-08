import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserOrRedirect } from "@/features/auth/server";
import { addToCurrentPlan, removePlanRecipe } from "@/features/mealplan/server";
import { getSharedRecipeWithPantry } from "@/features/recipes/server";
import { SharedRecipeView } from "@/features/recipes/ui/shared-recipe-view";
import { addKeyedItems, removeKeyedItems } from "@/features/shopping/server";
import { readLineOffers, readListedIds, readPlanWeeks } from "../../recipe-page-data";

export const metadata: Metadata = { title: "Delat recept" };

// Delade recept: another household's shared recipe, opened from the chip Delade in Recept. It is
// usable as it is, against the household's own pantry (the lines are matched to its catalog by
// ingredient name); "Spara i mina recept" makes a copy, and "Lägg på matsedeln" and "Köp det som
// saknas" save the copy quietly first and act on it (the meal plan and the list hold own recipes).
// An id that is not shared (any more), the household's own, or not a uuid is "Sidan finns inte."
export default function SharedRecipePage({ params }: PageProps<"/recept/delade/[id]">) {
  return (
    <Suspense fallback={null}>
      <SharedRecipeContent params={params} />
    </Suspense>
  );
}

async function SharedRecipeContent({ params }: Pick<PageProps<"/recept/delade/[id]">, "params">) {
  const { id } = await params;
  await requireUserOrRedirect(`/recept/delade/${encodeURIComponent(id)}`);
  const [found, offers, listedIds] = await Promise.all([getSharedRecipeWithPantry(id), readLineOffers(), readListedIds()]);
  if (!found) notFound();
  const { recipe, householdName, savedCopyId, snapshot, site, staples } = found;
  // The meal plan holds the household's copy, if saved: its dish is the one on the plan.
  const { weeks, remembered } = await readPlanWeeks(savedCopyId);
  return (
    <SharedRecipeView
      recipe={recipe}
      householdName={householdName}
      savedCopyId={savedCopyId}
      snapshot={snapshot}
      site={site}
      staples={staples}
      offers={offers}
      listedIds={listedIds}
      weeks={weeks}
      defaultWeekStart={remembered}
      addToPlan={addToCurrentPlan}
      buyMissing={addKeyedItems}
      undoBuy={removeKeyedItems}
      removeFromPlan={removePlanRecipe}
    />
  );
}
