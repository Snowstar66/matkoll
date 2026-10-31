import type { Metadata } from "next";
import { HelpView } from "./help-view";

export const metadata: Metadata = { title: "Hjälp och tips" };

// Hjälp och tips (Story 19.2): one section per tab, then Siri and the quick
// add, and Boenden. Static, so it needs no data and no session beyond the
// proxy's. Reached from the P button's sheet and the bottom of the side menu,
// which open it on the section of the tab they came from (#recept, #matsedel …).
export default function HelpPage() {
  return <HelpView />;
}
