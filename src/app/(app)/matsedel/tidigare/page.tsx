import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { PreviousPlansContent } from "./previous-plans-content";

export const metadata: Metadata = { title: "Tidigare matsedlar" };

// Tidigare matsedlar (FR-14), from "Tidigare" in Matsedel's header: the
// earlier plans newest first, and "Ny matsedel". The plans are read inside
// <Suspense> (AD-18), with skeleton rows while they load.
export default function PreviousPlansPage() {
  return (
    <>
      <PageHeader title="Tidigare matsedlar" backHref="/matsedel" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <PreviousPlansContent />
      </Suspense>
    </>
  );
}
