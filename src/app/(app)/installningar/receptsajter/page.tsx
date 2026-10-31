import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { listRecipeSites, SettingsDataError } from "@/features/settings/server";
import { RecipeSites } from "@/features/settings/ui/recipe-sites";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Receptsajter" };

// Receptsajter (FR7, Story 14.7): the approved recipe sites, with "Ta bort" and a field to add one.
export default function RecipeSitesPage() {
  return (
    <>
      <SettingsPageHeader title="Receptsajter" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <RecipeSitesContent />
      </Suspense>
    </>
  );
}

async function RecipeSitesContent() {
  await requireUserOrRedirect("/installningar/receptsajter");
  let sites: string[];
  try {
    sites = await listRecipeSites();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  return <RecipeSites sites={sites} />;
}
