"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { PrivacyNote } from "@/features/auth/ui/privacy-note";
import type { MemberColor } from "@/features/household";
import { NamePrompt } from "@/features/household/ui/name-prompt";
import { welcomeRoute } from "@/features/welcome";
import { WelcomeTour } from "@/features/welcome/ui/welcome-tour";
import { useWelcomeExit } from "./welcome-exit";

/** Story 21.2b: the name to ask for, or null when the person has said it (or it is not known). */
export type NameAsk = { suggested: string; tone: MemberColor } | null;

/** Story 21.2b: after Gå med, /ga-med sends the person on with `?valkommen=<household>`. */
export const welcomeParam = "valkommen";

const noNameAsk: Promise<NameAsk> = Promise.resolve(null);

/**
 * The first things someone sees, one at a time, over the page they landed on: "Vad heter du?" the
 * first time someone without a name signs in (Story 21.2b), the welcome tour the first time someone
 * opens the app (Story 20.1), and the privacy note (Story 17.2) only once both are closed, never on
 * top of them. `seen` and `name` are the server's answers; the layout hands over the promises and
 * this waits for them inside its own <Suspense> with nothing as the fallback, so someone who has
 * seen them never sees them flash, and the shell never waits (AD-18). The replay at /valkomst shows
 * its own tour, so none is shown there.
 */
export function WelcomeGate({ seen, name = noNameAsk }: { seen: Promise<boolean>; name?: Promise<NameAsk> }) {
  const alreadySeen = use(seen);
  const ask = use(name);
  const [closed, setClosed] = useState(false);
  const [named, setNamed] = useState(false);
  const pathname = usePathname();
  const onExit = useWelcomeExit(null);
  useJoinedToast();
  if (pathname === welcomeRoute) return null;
  if (ask && !named) return <NamePrompt suggested={ask.suggested} tone={ask.tone} onDone={() => setNamed(true)} />;
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

/** "Välkommen till Hushållet Hellgren." once after joining (a message, no Ångra); the parameter then goes from the address. */
function useJoinedToast() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();
  const household = params.get(welcomeParam);
  const shown = useRef(false);
  useEffect(() => {
    if (household === null || shown.current) return;
    shown.current = true;
    showToast(household ? `Välkommen till ${household}.` : "Välkommen.");
    const rest = new URLSearchParams(params.toString());
    rest.delete(welcomeParam);
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname, { scroll: false });
  }, [household, params, pathname, router, showToast]);
}
