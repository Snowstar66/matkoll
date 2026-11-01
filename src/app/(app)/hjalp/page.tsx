import type { Metadata } from "next";
import { getOwnerName } from "@/features/feedback/server";
import { version } from "../../../../package.json";
import { HelpView } from "./help-view";

export const metadata: Metadata = { title: "Hjälp och tips" };

// Hjälp och tips (Story 19.2, 20.2): search, the tour as a card, one area at a
// time with its steps and questions, and Tyck till. Static, so it needs no data
// and no session beyond the proxy's. Reached from the P button's sheet and the
// bottom of the side menu, which open it on the area of the tab they came from
// (#recept, #matsedel …). The version is read here, on the server, so
// package.json stays out of the browser's code. Tyck till's sheets (Story 20.3)
// name the owner from OWNER_EMAIL, also read here.
export default function HelpPage() {
  return <HelpView version={version.split(".").slice(0, 2).join(".")} ownerName={getOwnerName()} />;
}
