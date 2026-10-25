import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { SettingsIcon } from "@/components/icons";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Recept" };

// The library arrives in Story 1.10 and import in Story 1.6; until then the empty state has no button.
export default function RecipesPage() {
  return (
    <>
      <PageHeader
        title="Recept"
        action={
          // On desktop, Inställningar is at the bottom of the side menu instead.
          <Link
            href="/installningar"
            scroll={false}
            aria-label="Inställningar"
            className="flex size-tap items-center justify-center rounded-full text-ink-2 desktop:hidden"
          >
            <SettingsIcon size={24} />
          </Link>
        }
      />
      <Suspense fallback={<Skeleton />}>
        <RecipesContent />
      </Suspense>
    </>
  );
}

async function RecipesContent() {
  await requireUserOrRedirect("/recept");
  return <EmptyState>Inga recept än. Klistra in en länk till ett recept du gillar.</EmptyState>;
}
