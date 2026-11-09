import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getMemberPeople } from "@/features/household/server";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

export const metadata: Metadata = { title: "Äta ute: smak och allergier" };

// Profiles for Menyrådgivare: taste, usual drink and allergies per person, kept for the household (the database,
// so every phone shows the same). Reached from Inställningar, Hushåll (and from Tillval). The household's members and
// what is saved for them are read here; this device's own list is only the fallback.
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
  const [members, profiles] = await Promise.all([getMemberPeople(), getSavedFoodPeople()]);
  return <ProfilesScreen members={members} profiles={profiles} />;
}
