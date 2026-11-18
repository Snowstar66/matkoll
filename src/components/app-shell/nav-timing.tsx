"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useOption } from "@/lib/use-option";
import { latestNavTiming, noteCommitted, noteReady, noteTap, subscribeNavTiming, timingText } from "./nav-timing-store";

/** How long the figure stays on the screen. */
export const timingShownMs = 8_000;

/**
 * The small figure at the top left after a switch of tab, with the Tillval "Visa sidtider" on ("Recept 412 ms (ramen
 * efter 38 ms)"): the first number is the tap to the content, the one in brackets the tap to the frame. It also listens
 * for taps on links, so the clock starts where the finger does. Renders nothing, and listens to nothing, with the option off.
 */
export function NavTimingBadge() {
  const on = useOption("showTimings");
  const pathname = usePathname();
  const latest = useSyncExternalStore(subscribeNavTiming, latestNavTiming, () => null);
  const [hiddenFor, setHiddenFor] = useState<unknown>(null);

  useEffect(() => {
    if (!on) return;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]");
      const href = link?.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//")) return;
      noteTap(href.split("?")[0]!.split("#")[0]!, window.location.pathname);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [on]);

  useEffect(() => {
    if (on) noteCommitted(pathname);
  }, [on, pathname]);

  useEffect(() => {
    if (!latest) return;
    const timer = setTimeout(() => setHiddenFor(latest), timingShownMs);
    return () => clearTimeout(timer);
  }, [latest]);

  if (!on || !latest || hiddenFor === latest) return null;
  return (
    <p
      role="status"
      data-testid="nav-timing"
      className="pointer-events-none fixed top-[calc(env(safe-area-inset-top,0px)+0.25rem)] left-2 z-50 rounded-md bg-ink px-2 py-1 font-mono text-badge text-bg"
    >
      {timingText(latest)}
    </p>
  );
}

/**
 * Marks that the page's content has arrived. Put at the end of a tab's content (inside its <Suspense>), so it mounts when
 * the data is there. Costs nothing with "Visa sidtider" off.
 */
export function PageReady({ name }: { name: string }) {
  const on = useOption("showTimings");
  useEffect(() => {
    if (!on) return;
    // The address, not a hook: the page's content is rendered where no router is needed to know where it is.
    const result = noteReady(name, window.location.pathname);
    if (result) console.info("[sidtid]", timingText(result));
  }, [on, name]);
  return null;
}
