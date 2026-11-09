import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getMemberPeople } from "@/features/household/server";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { MenuAdvisor } from "@/features/menu-advisor/ui/menu-advisor";

export const metadata: Metadata = { title: "Menyrådgivare" };

// Menyrådgivare (Tillval, off by default), from "Äter ute?" under Matsedel: photograph a restaurant menu, have it
// explained in Swedish and, if you want, marked against what you avoid. The household's members are read here so
// they can be picked as company straight away; the rest happens in the client. The reading is POST /api/menu/read.
export default function MenuAdvisorPage() {
  return (
    <>
      <PageHeader title="Menyrådgivare" backHref="/matsedel" backLabel="Matsedel" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <Advisor />
      </Suspense>
    </>
  );
}

async function Advisor() {
  const [members, profiles] = await Promise.all([getMemberPeople(), getSavedFoodPeople()]);
  return <MenuAdvisor members={members} profiles={profiles} />;
}
