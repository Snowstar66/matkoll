import type { Metadata } from "next";
import { PaletteSettings } from "@/features/settings/ui/palette-settings";
import { TextSettings } from "@/features/settings/ui/text-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Utseende" };

// Utseende: the colour theme, text size and bold text, chosen per device (stored in the browser, applied before first paint).
export default function AppearancePage() {
  return (
    <>
      <SettingsPageHeader title="Utseende" />
      <PaletteSettings />
      <div className="mt-4">
        <TextSettings />
      </div>
    </>
  );
}
