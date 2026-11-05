import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { getPushSettings, PushDataError } from "@/features/push/server";
import { PushSettings } from "@/features/push/ui/push-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Notiser" };

// Notiser (Story 23.3): push notifications from the household, and what to be told about.
export default function PushPage() {
  return (
    <>
      <SettingsPageHeader title="Notiser" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <PushContent />
      </Suspense>
    </>
  );
}

async function PushContent() {
  await requireUserOrRedirect("/installningar/notiser");
  let settings: Awaited<ReturnType<typeof getPushSettings>>;
  try {
    settings = await getPushSettings();
  } catch (error) {
    if (!(error instanceof PushDataError)) throw error;
    console.error("push_settings_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.push_save_failed}</Notice>;
  }
  return <PushSettings publicKey={settings.publicKey} preferences={settings.preferences} />;
}
