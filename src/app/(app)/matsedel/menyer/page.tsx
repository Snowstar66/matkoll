import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { MenuAdvisor } from "@/features/menu-advisor/ui/menu-advisor";

export const metadata: Metadata = { title: "Menyrådgivare" };

// Menyrådgivare (Tillval, off by default), from "Äter ute?" under Matsedel: photograph a restaurant menu, have it
// explained in Swedish and, if you want, marked against what you avoid. Everything happens in the client; the page
// only holds the header. The reading is POST /api/menu/read.
export default function MenuAdvisorPage() {
  return (
    <>
      <PageHeader title="Menyrådgivare" backHref="/matsedel" backLabel="Matsedel" />
      <MenuAdvisor />
    </>
  );
}
