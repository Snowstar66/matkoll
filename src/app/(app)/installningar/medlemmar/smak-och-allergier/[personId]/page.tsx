import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getMemberPeople } from "@/features/household/server";
import { profilesBackHref } from "@/features/menu-advisor";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

export const metadata: Metadata = { title: "Smak och allergier" };

// One person's Smak och allergier: taste, usual drink and allergies, kept for the household (the database, so every
// phone shows the same). Reached from Inställningar, Medlemmar. Does not need the Menyrådgivare option. The household's
// members and what is saved for them are read here; this device's own list is only the fallback.
export default function ProfilePage({ params }: PageProps<"/installningar/medlemmar/smak-och-allergier/[personId]">) {
  return (
    <>
      <PageHeader title="Smak och allergier" backHref={profilesBackHref} backLabel="Medlemmar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Profile params={params} />
      </Suspense>
    </>
  );
}

async function Profile({ params }: Pick<PageProps<"/installningar/medlemmar/smak-och-allergier/[personId]">, "params">) {
  const { personId } = await params;
  const [members, profiles] = await Promise.all([getMemberPeople(), getSavedFoodPeople()]);
  return <ProfilesScreen personId={decodeURIComponent(personId)} members={members} profiles={profiles} backHref={profilesBackHref} />;
}
