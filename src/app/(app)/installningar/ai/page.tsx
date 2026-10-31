import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/skeleton";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { AiContent } from "../ai-content";

export const metadata: Metadata = { title: "AI" };

// AI (Story 17.5, Story 14.7): provider, model and level; only for those it is shown to.
export default function AiPage() {
  return (
    <>
      <SettingsPageHeader title="AI" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <AiContent />
      </Suspense>
    </>
  );
}
