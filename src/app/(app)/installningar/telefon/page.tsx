import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { listApiKeys, SettingsDataError } from "@/features/settings/server";
import type { ApiKeyView } from "@/features/settings";
import { PhoneSetup } from "@/features/settings/ui/phone-setup";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Använd med telefonen" };

// Använd med telefonen: save recipes from Safari and add items with Siri (Story 1.13, Story 17.9), on one page.
export default function PhonePage() {
  return (
    <>
      <SettingsPageHeader title="Använd med telefonen" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <PhoneContent />
      </Suspense>
    </>
  );
}

async function PhoneContent() {
  await requireUserOrRedirect("/installningar/telefon");
  let keys: ApiKeyView[];
  try {
    keys = await listApiKeys();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  return <PhoneSetup keys={keys} />;
}
