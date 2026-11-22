"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { MemberColor } from "@/features/household";
import { NamePrompt } from "@/features/household/ui/name-prompt";
import { tourSeenCookieText, welcomeRoute } from "@/features/welcome";
import { WelcomeTour } from "@/features/welcome/ui/welcome-tour";
import { useAreasMessage, useWelcomeExit } from "./welcome-exit";

/** Story 21.2b: the name to ask for, or null when the person has said it (or it is not known). */
export type NameAsk = { suggested: string; tone: MemberColor } | null;

/** Story 21.2b: after Gå med, /ga-med sends the person on with `?valkommen=<household>`. */
export const welcomeParam = "valkommen";

const noNameAsk: Promise<NameAsk> = Promise.resolve(null);
const noUser: Promise<string | null> = Promise.resolve(null);

/**
 * The first things someone sees, one at a time, over the page they landed on: "Vad heter du?" the
 * first time someone without a name signs in (Story 21.2b), the welcome tour the first time someone
 * opens the app (Story 20.1) (the privacy line is on its last page, UX-24). `seen` and `name` are the server's answers; the layout hands over the promises and
 * this waits for them inside its own <Suspense> with nothing as the fallback, so someone who has
 * seen them never sees them flash, and the shell never waits (AD-18). The replay at /valkomst shows
 * its own tour, so none is shown there.
 */
export function WelcomeGate({ seen, name = noNameAsk, userId = noUser }: { seen: Promise<boolean>; name?: Promise<NameAsk>; userId?: Promise<string | null> }) {
  const alreadySeen = use(seen);
  const id = use(userId);
  // Once the server says this person has seen the tour, the device remembers it (see tour-cookie.ts).
  useEffect(() => {
    if (!alreadySeen || !id) return;
    try {
      document.cookie = tourSeenCookieText(id, window.location.protocol === "https:");
    } catch {
      // Cookies blocked: the database is asked as before.
    }
  }, [alreadySeen, id]);
  const ask = use(name);
  const [closed, setClosed] = useState(false);
  const [named, setNamed] = useState(false);
  const pathname = usePathname();
  const onExit = useWelcomeExit(null);
  const areasMessage = useAreasMessage();
  useJoinedToast();
  if (pathname === welcomeRoute) return null;
  if (ask && !named) return <NamePrompt suggested={ask.suggested} tone={ask.tone} onDone={() => setNamed(true)} />;
  if (!alreadySeen && !closed) {
    return (
      <WelcomeTour
        onAreasChosen={areasMessage.choose}
        onExit={(exit, photo) => {
          setClosed(true);
          onExit(exit, photo);
          areasMessage.announce();
        }}
      />
    );
  }
  return null;
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
