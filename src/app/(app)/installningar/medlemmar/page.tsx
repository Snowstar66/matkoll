import type { Metadata } from "next";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { appName } from "@/app/app-info";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { Household } from "@/features/household";
import { getHousehold, getMemberPeople, HouseholdDataError } from "@/features/household/server";
import { MembersSettings } from "@/features/household/ui/members-settings";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { ProfileGroups } from "@/features/menu-advisor/ui/profile-groups";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Medlemmar" };

// Medlemmar (Story 21.2b): who is in the household, the invitations, leaving and handing over, and each person's Smak och allergier.
export default function MembersPage() {
  return (
    <>
      <SettingsPageHeader title="Medlemmar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <MembersContent />
      </Suspense>
    </>
  );
}

async function MembersContent() {
  await requireUserOrRedirect("/installningar/medlemmar");
  let household: Household;
  try {
    household = await getHousehold();
  } catch (error) {
    if (!(error instanceof HouseholdDataError)) throw error;
    console.error("household_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.household_unavailable}</Notice>;
  }
  return (
    <MembersSettings
      household={household}
      siteUrl={env.SITE_URL}
      appName={appName}
      after={
        <Suspense fallback={<Skeleton rows={3} />}>
          <Profiles />
        </Suspense>
      }
    />
  );
}

/** Smak och allergier under the member list: who is in the household and what is saved for them. */
async function Profiles() {
  const [members, profiles] = await Promise.all([getMemberPeople(), getSavedFoodPeople()]);
  return <ProfileGroups members={members} profiles={profiles} />;
}
