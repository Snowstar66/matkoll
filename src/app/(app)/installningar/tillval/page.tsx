import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { checkCountText, checkMissingText } from "@/features/nutrition";
import { getNutritionCheck } from "@/features/nutrition/server";
import { getRecipeSharing, listRecipeRows } from "@/features/recipes/server";
import { SharingSettings, type RecipeSharing } from "@/features/recipes/ui/sharing-settings";
import { OptionRow, OptionSettings } from "@/features/settings/ui/option-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Tillval" };

// Tillval: switches for the quiet extras, chosen per device (stored in the browser), and last the
// group Delade recept, whose "Dela alla mina recept" and "Sluta dela alla" are the household's
// (read here, inside <Suspense>; until then, or when it cannot be read, only the device's row).
export default function OptionsPage() {
  const showRow = <OptionRow id="showShared" />;
  return (
    <>
      <SettingsPageHeader title="Tillval" />
      <OptionSettings
        nutritionNote={
          <Suspense fallback={null}>
            <NutritionCheckNote />
          </Suspense>
        }
        after={
          <Suspense fallback={<SharingSettings showRow={showRow} sharing={null} />}>
            <HouseholdSharing showRow={showRow} />
          </Suspense>
        }
      />
    </>
  );
}

async function HouseholdSharing({ showRow }: { showRow: ReactNode }) {
  let sharing: RecipeSharing | null = null;
  try {
    sharing = await getRecipeSharing();
  } catch (error) {
    console.error("recipe_sharing_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
  }
  return <SharingSettings showRow={showRow} sharing={sharing} />;
}

/**
 * Näringskoll: how many of the household's recipes the nutrition can be counted for (the recipe cards' own
 * gate) and what is missing most often. Read under its own <Suspense>, so the page never waits for it; no line
 * when it cannot be read or there are no recipes.
 */
async function NutritionCheckNote() {
  let count: string | null = null;
  let missing: string | null = null;
  try {
    const rows = await listRecipeRows();
    const check = await getNutritionCheck(rows.map((row) => ({ servings: row.originalServings, lines: row.lines })));
    count = checkCountText(check);
    missing = checkMissingText(check);
  } catch (error) {
    console.error("nutrition_check_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
  }
  if (!count) return null;
  return (
    <p className="mx-1 mt-2 text-meta text-ink-3" data-testid="nutrition-check">
      {count}
      {missing ? <> {missing}</> : null}
    </p>
  );
}
