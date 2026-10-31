import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { PrylarContent } from "./prylar-content";

export const metadata: Metadata = { title: "Förråd" };

// "Fråga om dina matvaror" is a Server Action on this page (Story 18.4); the
// model gets at most 45 s of this.
export const maxDuration = 60;

// Prylar, at /prylar (Epic 18, Story 18.1): the places of the selected boende
// grouped by room, each with how many things its latest card has and the
// card's date and "Ny plats". With two or more boenden a phone has the boende
// button under the title, as the side menu has it on a desktop (Story 16.14);
// the boende is the one selected there, things belong to it and never touch the food. Everything is read inside <Suspense> (AD-18).
export default function PrylarPage() {
  return (
    <Suspense
      fallback={
        <>
          {/* The size of "+", so the header does not move when it arrives. */}
          <PageHeader title="Förråd" action={<span aria-hidden="true" inert className="size-tap" />} />
          <Skeleton rows={3} />
        </>
      }
    >
      <PrylarContent />
    </Suspense>
  );
}
