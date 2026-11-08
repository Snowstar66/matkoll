import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { getRecipeSharing } from "@/features/recipes/server";
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
