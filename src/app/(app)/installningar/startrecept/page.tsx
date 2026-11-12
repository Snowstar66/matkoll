import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { StarterPackEntry } from "@/features/recipes";
import { getStarterPack, listRecipeTitles } from "@/features/recipes/server";
import { StarterPackAdmin } from "@/features/recipes/ui/starter-pack-admin";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Startrecept" };

// Startrecept (Kom igång med recept): the app's owner manages the pack of starter recipes, which
// are the owner's own recipes. For the owner only: anyone else gets "not found" (the database
// refuses them, and the page does not say it exists).
export default function StarterPackPage() {
  return (
    <>
      <SettingsPageHeader title="Startrecept" />
      <Suspense fallback={<Skeleton rows={4} />}>
        <StarterPackContent />
      </Suspense>
    </>
  );
}

async function StarterPackContent() {
  await requireUserOrRedirect("/installningar/startrecept");
  let entries: StarterPackEntry[] | null;
  let recipes: { id: string; title: string }[];
  try {
    [entries, recipes] = await Promise.all([getStarterPack(), listRecipeTitles()]);
  } catch (error) {
    console.error("starter_pack_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  if (!entries) notFound();
  return <StarterPackAdmin entries={entries} recipes={recipes} />;
}
