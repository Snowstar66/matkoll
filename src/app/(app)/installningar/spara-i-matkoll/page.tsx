import type { Metadata } from "next";
import { SaveToMatkoll } from "@/features/settings/ui/save-to-matkoll";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Spara i Matkoll" };

// Spara i Matkoll (Story 1.13, Story 14.7): the guide, one device at a time.
export default function SaveToMatkollPage() {
  return (
    <>
      <SettingsPageHeader title="Spara i Matkoll" />
      <SaveToMatkoll />
    </>
  );
}
