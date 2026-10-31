import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { SettingsShell } from "@/features/settings/ui/settings-shell";
import { SettingsMenuContent } from "./settings-menu-content";

// Inställningar (FR7, FR-28, UX-DR16, Story 14.7): a short start page of
// groups, and one page per row (konto, boenden, butiker, receptsajter,
// spara-i-matkoll, ai, installera, om). The shell shows one of them at a time
// on a phone and both from 1024 px. The start page's values are read inside a
// <Suspense> (AD-18), so a failure in one never hides the rest; "Logga ut"
// sits in the menu's own group and needs no data, so it works even when
// nothing can be read.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <SettingsShell
      header={<PageHeader title="Inställningar" backHref="/recept" backLabel="Recept" backOnlyOnMobile />}
      menu={
        <Suspense fallback={<Skeleton rows={4} />}>
          <SettingsMenuContent />
        </Suspense>
      }
    >
      {children}
    </SettingsShell>
  );
}
