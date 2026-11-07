import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { getHouseholdCosts, SettingsDataError } from "@/features/settings/server";
import { AiCostSettings } from "@/features/settings/ui/ai-cost-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "AI-kostnad" };

// AI-kostnad (Tak för AI-kostnad per hushåll): the app's owner sets the daily cap and sees each household's
// estimated cost, for the owner only. Anyone else gets "not found": the database refuses them, and the page
// does not say it exists.
export default function AiCostPage() {
  return (
    <>
      <SettingsPageHeader title="AI-kostnad" />
      <Suspense fallback={<Skeleton rows={4} />}>
        <AiCostContent />
      </Suspense>
    </>
  );
}

async function AiCostContent() {
  await requireUserOrRedirect("/installningar/ai-kostnad");
  let costs: Awaited<ReturnType<typeof getHouseholdCosts>>;
  try {
    costs = await getHouseholdCosts();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("ai_cap_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.ai_cap_unavailable}</Notice>;
  }
  if (!costs) notFound();
  return <AiCostSettings capSek={costs.capSek} households={costs.households} />;
}
