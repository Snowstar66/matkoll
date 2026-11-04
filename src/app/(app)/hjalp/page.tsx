import type { Metadata } from "next";
import { getOwnerName } from "@/features/feedback/server";
import { buildDayText, readBuildInfo, shortVersion } from "@/app/build-info";
import { HelpView } from "./help-view";

export const metadata: Metadata = { title: "Hjälp och tips" };

// Hjälp och tips (Story 19.2, 20.2): search, the tour as a card, one area at a
// time with its steps and questions, and Tyck till. Static, so it needs no data
// and no session beyond the proxy's. Reached from the P button's sheet and the
// bottom of the side menu, which open it on the area of the tab they came from
// (#recept, #matsedel …). The version and build day (build-info.ts, the same
// as Om Livskoll) are read here, on the server. Tyck till's sheets (Story 20.3)
// name the owner from OWNER_EMAIL, also read here.
export default function HelpPage() {
  const build = readBuildInfo();
  return <HelpView version={shortVersion(build.version)} updated={buildDayText(build.builtAt)} ownerName={getOwnerName()} />;
}
