import type { Metadata } from "next";
import { OptionSettings } from "@/features/settings/ui/option-settings";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";

export const metadata: Metadata = { title: "Tillval" };

// Tillval: switches for the quiet extras, chosen per device (stored in the browser).
export default function OptionsPage() {
  return (
    <>
      <SettingsPageHeader title="Tillval" />
      <OptionSettings />
    </>
  );
}
