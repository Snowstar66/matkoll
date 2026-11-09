import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

export const metadata: Metadata = { title: "Äta ute: profiler" };

// Profiles for Menyrådgivare (Tillval): taste, usual drink and allergies per person, kept on this device.
// Everything happens in the client; the page only holds the header.
export default function MenuProfilesPage() {
  return (
    <>
      <PageHeader title="Äta ute: profiler" backHref="/installningar/tillval" backLabel="Tillval" />
      <ProfilesScreen />
    </>
  );
}
