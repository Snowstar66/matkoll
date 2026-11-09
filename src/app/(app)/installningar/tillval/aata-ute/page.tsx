import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getMemberPeople } from "@/features/household/server";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

export const metadata: Metadata = { title: "Äta ute: smak och allergier" };

// Profiles for Menyrådgivare: taste, usual drink and allergies per person, kept on this device. Reached from
// Inställningar, Hushåll (and from Tillval). The household's members are read here and come with as people; what is
// filled in for them lives in the browser.
export default function MenuProfilesPage() {
  return (
    <>
      <PageHeader title="Äta ute: smak och allergier" backHref="/installningar" backLabel="Inställningar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Profiles />
      </Suspense>
    </>
  );
}

async function Profiles() {
  return <ProfilesScreen members={await getMemberPeople()} />;
}
