import type { Metadata } from "next";
import { SaveToMatkoll } from "@/features/settings/ui/save-to-matkoll";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { appName } from "@/app/app-info";

export const metadata: Metadata = { title: `Spara i ${appName}` };

// Spara i Matkoll (Story 1.13, Story 14.7): the guide, one device at a time.
export default function SaveToMatkollPage() {
  return (
    <>
      <SettingsPageHeader title={`Spara i ${appName}`} />
      <SaveToMatkoll />
    </>
  );
}
