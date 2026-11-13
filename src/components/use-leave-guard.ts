"use client";

import { useEffect, useRef } from "react";

/**
 * Asks before the page is left while it has unsaved changes (`message` set; null = nothing to lose): the browser's own
 * question when the tab is closed or reloaded (beforeunload), and a plain confirm before a link inside the app is
 * followed (the tab bar, "Tillbaka", any link). Answering OK leaves and calls `onLeave` (to drop the draft, so it is
 * not there again when the page is kept in the background); Avbryt stays. Not caught: the browser's own back button or
 * swipe, which Next.js handles without a way to stop it.
 */
export function useLeaveGuard(message: string | null, onLeave?: () => void) {
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });

  useEffect(() => {
    if (message === null) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need returnValue set to show their question.
      event.returnValue = "";
    };
    // Capture on the document runs before React's own handlers (and next/link's), so a "stay" stops the navigation.
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank" || link.hasAttribute("download")) return;
      const to = new URL(link.href, window.location.href);
      const here = new URL(window.location.href);
      if (to.origin !== here.origin) return;
      if (to.pathname === here.pathname && to.search === here.search) return;
      if (window.confirm(message)) {
        leave.current?.();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [message]);
}
