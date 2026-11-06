import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { appName } from "@/app/app-info";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { type AppInvite } from "@/features/app-invites";
import { AppInviteDataError, listAppInvites } from "@/features/app-invites/server";
import { AppInvitesSettings } from "@/features/app-invites/ui/app-invites-settings";
import { requireUserOrRedirect } from "@/features/auth/server";
import { getMe } from "@/features/household/server";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Inbjudningar" };

// Inbjudningar (Story 21.1): the app's owner invites an address, for the owner only. Anyone
// else gets "not found": the database refuses them, and the page does not say it exists.
export default function InvitationsPage() {
  return (
    <>
      <SettingsPageHeader title="Inbjudningar" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <InvitationsContent />
      </Suspense>
    </>
  );
}

async function InvitationsContent() {
  const user = await requireUserOrRedirect("/installningar/inbjudningar");
  let invites: AppInvite[] | null;
  try {
    invites = await listAppInvites();
  } catch (error) {
    if (!(error instanceof AppInviteDataError)) throw error;
    console.error("app_invite_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.app_invite_unavailable}</Notice>;
  }
  if (!invites) notFound();
  const me = await getMe();
  return <AppInvitesSettings invites={invites} siteUrl={env.SITE_URL} appName={appName} inviter={me?.name ?? user.email} now={new Date().toISOString()} />;
}
