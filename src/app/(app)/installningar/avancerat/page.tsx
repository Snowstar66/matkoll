import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { AdvancedContent } from "../advanced-content";

export const metadata: Metadata = { title: "Avancerat" };

// Avancerat: Receptsajter, and for those who see the AI row also the AI choice, the web search and Visa sidtider.
export default function AdvancedPage() {
  return (
    <>
      <SettingsPageHeader title="Avancerat" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <AdvancedContent />
      </Suspense>
    </>
  );
}
