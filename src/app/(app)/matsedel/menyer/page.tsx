import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { isAppOwner } from "@/features/feedback/server";
import { getMemberPeople } from "@/features/household/server";
import { getSavedFoodPeople } from "@/features/menu-advisor/server";
import { MenuWithRestaurants } from "./menu-with-restaurants";
import { RefreshOnShow } from "./refresh-on-show";

export const metadata: Metadata = { title: "Menyrådgivare" };

// Menyrådgivare (Tillval, off by default), from "Äter ute?" under Matsedel: photograph a restaurant menu, have it
// explained in Swedish and, if you want, marked against what you avoid. The household's members are read here so
// they can be picked as company straight away; the rest happens in the client. The reading is POST /api/menu/read.
// The advisor's screens carry their own title and back link (one of each per screen); the page header stays for
// Sök restauranger only. Whether the user owns the app decides if the AI-cap stop offers "Höj taket".
export default function MenuAdvisorPage() {
  return (
    <Suspense fallback={<Skeleton rows={3} />}>
      <Advisor />
    </Suspense>
  );
}

async function Advisor() {
  const [members, profiles, owner] = await Promise.all([
    getMemberPeople(),
    getSavedFoodPeople(),
    isAppOwner().catch(() => false),
  ]);
  return (
    <>
      <RefreshOnShow />
      <MenuWithRestaurants
        members={members}
        profiles={profiles}
        canRaiseCap={owner}
        agentHeader={
          <PageHeader
            title="Menyrådgivare"
            backHref="/matsedel"
            backLabel="Matsedel"
          />
        }
      />
    </>
  );
}
