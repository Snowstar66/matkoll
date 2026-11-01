"use client";

import { usePathname } from "next/navigation";
import { use, useState } from "react";
import { PrivacyNote } from "@/features/auth/ui/privacy-note";
import { welcomeRoute } from "@/features/welcome";
import { WelcomeTour } from "@/features/welcome/ui/welcome-tour";
import { useWelcomeExit } from "./welcome-exit";

/**
 * The welcome tour the first time someone opens the app (Story 20.1), over the page they landed on,
 * and the privacy note (Story 17.2) only once the tour is closed, never on top of it. `seen` is the
 * server's answer (welcome_tour); the layout hands over the promise and this waits for it inside
 * its own <Suspense> with nothing as the fallback, so someone who has seen the tour never sees it
 * flash, and the shell never waits (AD-18). The replay at /valkomst shows its own tour, so neither
 * is shown there.
 */
export function WelcomeGate({ seen }: { seen: Promise<boolean> }) {
  const alreadySeen = use(seen);
  const [closed, setClosed] = useState(false);
  const pathname = usePathname();
  const onExit = useWelcomeExit(null);
  if (pathname === welcomeRoute) return null;
  if (!alreadySeen && !closed) {
    return (
      <WelcomeTour
        onExit={(exit, photo) => {
          setClosed(true);
          onExit(exit, photo);
        }}
      />
    );
  }
  return <PrivacyNote />;
}
