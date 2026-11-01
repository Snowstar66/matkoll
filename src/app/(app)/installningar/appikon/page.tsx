import type { Metadata } from "next";
import { AppBadgeSettings } from "@/features/settings/ui/app-badge-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Siffra på appikonen" };

// Siffra på appikonen (Story 23.2): the number of news on the app's icon, opt-in per device.
export default function AppBadgePage() {
  return (
    <>
      <SettingsPageHeader title="Siffra på appikonen" />
      <AppBadgeSettings />
    </>
  );
}
