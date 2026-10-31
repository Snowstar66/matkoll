import type { Metadata } from "next";
import { InstallApp } from "@/features/settings/ui/install-app";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Installera appen" };

// Installera appen (Story 11.6, Story 14.7): Matkoll on the home screen.
export default function InstallPage() {
  return (
    <>
      <SettingsPageHeader title="Installera appen" />
      <InstallApp />
    </>
  );
}
