import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { listApiKeys, SettingsDataError } from "@/features/settings/server";
import type { ApiKeyView } from "@/features/settings";
import { ApiKeys } from "@/features/settings/ui/api-keys";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Siri och genvägar" };

// Siri och genvägar (Story 17.9): personal keys for the quick-add API, and the guide for the iOS shortcut.
export default function SiriPage() {
  return (
    <>
      <SettingsPageHeader title="Siri och genvägar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <SiriContent />
      </Suspense>
    </>
  );
}

async function SiriContent() {
  await requireUserOrRedirect("/installningar/siri");
  let keys: ApiKeyView[];
  try {
    keys = await listApiKeys();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  return <ApiKeys keys={keys} />;
}
