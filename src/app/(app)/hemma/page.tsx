import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Hemma" };

// The pantry (places, items, camera) arrives in Epic 2.
export default function HomePage() {
  return (
    <>
      <PageHeader title="Hemma" />
      <Suspense fallback={<Skeleton />}>
        <HomeContent />
      </Suspense>
    </>
  );
}

async function HomeContent() {
  await requireUserOrRedirect("/hemma");
  return <EmptyState>Inget i kylen än.</EmptyState>;
}
