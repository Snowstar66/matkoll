import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice } from "@/components/notice";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";
import { type FeedbackItem } from "@/features/feedback";
import { FeedbackDataError, listInbox } from "@/features/feedback/server";
import { Inbox } from "@/features/feedback/ui/inbox";
import { SettingsPageHeader } from "@/features/settings/ui/settings-page-header";
import { errorMessages } from "@/lib/errors";

export const metadata: Metadata = { title: "Inkorg" };

// Inkorg (Story 20.3): what is sent from Hjälp > Tyck till, for the app's owner only.
// Anyone else gets "not found": the database shows them no rows, and the page does not
// say it exists.
export default function InboxPage() {
  return (
    <>
      <SettingsPageHeader title="Inkorg" />
      <Suspense fallback={<Skeleton rows={4} />}>
        <InboxContent />
      </Suspense>
    </>
  );
}

async function InboxContent() {
  await requireUserOrRedirect("/installningar/inkorg");
  let items: FeedbackItem[] | null;
  try {
    items = await listInbox();
  } catch (error) {
    if (!(error instanceof FeedbackDataError)) throw error;
    console.error("feedback_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.settings_unavailable}</Notice>;
  }
  if (!items) notFound();
  return <Inbox items={items} now={new Date().toISOString()} />;
}
