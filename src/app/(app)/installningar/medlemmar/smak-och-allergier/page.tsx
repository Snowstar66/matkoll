import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getMemberPeople } from "@/features/household/server";
import { profilesBackHref, profilesHref } from "@/features/menu-advisor";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { ProfilesScreen } from "@/features/menu-advisor/ui/profiles-screen";

export const metadata: Metadata = { title: "Smak och allergier" };

// One person's Smak och allergier (?person=me, ?person=m-<userId> or one added by hand): taste, usual drink and
// allergies, kept for the household (the database, so every phone shows the same). Reached from Inställningar,
// Medlemmar. Does not need the Menyrådgivare option. The household's members and what is saved for them are read
// here; this device's own list is only the fallback. Without a person, the list on Medlemmar is where this leads.
export default function ProfilePage({ searchParams }: PageProps<"/installningar/medlemmar/smak-och-allergier">) {
  return (
    <>
      <PageHeader title="Smak och allergier" backHref={profilesBackHref} backLabel="Medlemmar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Profile searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Profile({ searchParams }: Pick<PageProps<"/installningar/medlemmar/smak-och-allergier">, "searchParams">) {
  const { person } = await searchParams;
  if (typeof person !== "string" || person === "") redirect(profilesHref);
  const [members, profiles] = await Promise.all([getMemberPeople(), getSavedFoodPeople()]);
  return <ProfilesScreen personId={person} members={members} profiles={profiles} backHref={profilesBackHref} />;
}
