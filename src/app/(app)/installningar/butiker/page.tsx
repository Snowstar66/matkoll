import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { StoreContent } from "../store-content";

export const metadata: Metadata = { title: "Butiker" };

// Butiker (Story 14.7): the selected store and the others (FR-28).
export default function StoresPage() {
  return (
    <>
      <SettingsPageHeader title="Butiker" />
      <Suspense fallback={<Skeleton rows={2} />}>
        <StoreContent />
      </Suspense>
    </>
  );
}
