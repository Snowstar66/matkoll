import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Inställningar" };

// Recipe sites and "Logga ut" arrive in Story 1.12; for now only the title.
export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Inställningar" backHref="/recept" />
      <Suspense fallback={null}>
        <SettingsContent />
      </Suspense>
    </>
  );
}

async function SettingsContent() {
  await requireUserOrRedirect("/installningar");
  return null;
}
