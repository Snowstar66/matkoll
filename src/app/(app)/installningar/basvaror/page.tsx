import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { Staple } from "@/features/pantry";
import { listStaples, PantryDataError } from "@/features/pantry/server";
import { StaplesSettings } from "@/features/pantry/ui/staples-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Basvaror" };

// Basvaror (Pontus 2026-11-02): what the household always has at home, never on the shopping list.
export default function StaplesPage() {
  return (
    <>
      <SettingsPageHeader title="Basvaror" />
      <Suspense fallback={<Skeleton rows={6} />}>
        <StaplesContent />
      </Suspense>
    </>
  );
}

async function StaplesContent() {
  await requireUserOrRedirect("/installningar/basvaror");
  let staples: Staple[];
  try {
    staples = await listStaples();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("staples_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.staples_unavailable}</Notice>;
  }
  return <StaplesSettings staples={staples} />;
}
