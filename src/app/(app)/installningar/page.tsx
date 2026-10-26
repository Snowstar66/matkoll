import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { SignOutButton } from "@/features/auth/ui/sign-out-button";
import { listRecipeSites, SettingsDataError } from "@/features/settings/server";
import { RecipeSites } from "@/features/settings/ui/recipe-sites";
import { errorMessages } from "@/lib/errors";
import { StoreContent } from "./store-content";

export const metadata: Metadata = { title: "Inställningar" };

// Inställningar (FR7, FR-28, UX-DR16): the approved recipe sites, the store
// under them and "Logga ut" at the bottom. The sites and the stores are read
// inside a <Suspense> each (AD-18), so a failure in one shows only in its own
// section; "Logga ut" sits outside both, so it works even when neither can be
// read.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Inställningar" backHref="/recept" />
      <div className="flex flex-1 flex-col gap-10">
        <Suspense fallback={<Skeleton rows={3} />}>
          <SettingsContent />
        </Suspense>
        <Suspense fallback={<Skeleton rows={2} />}>
          <StoreContent />
        </Suspense>
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </div>
    </>
  );
}

async function SettingsContent() {
  await requireUserOrRedirect("/installningar");
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
