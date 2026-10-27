"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { shellPaths } from "./destinations";
import { noteInAppNavigation } from "./in-app-history";

/** How long to keep trying while the page below streams in and grows. */
const restoreForMs = 1500;

/**
 * Keeps the scroll position of each main surface, so switching tabs and back lands
 * where Pontus left off (EXPERIENCE.md, Flikfält / Sidomeny). The tab links use
 * `scroll={false}`; this puts a surface back at its saved position, or the top.
 */
export function ScrollMemory() {
  // The path of a dynamic route is known only at request time (AD-18).
  return (
    <Suspense fallback={null}>
      <PathScrollMemory />
    </Suspense>
  );
}

function PathScrollMemory() {
  const pathname = usePathname();
  const positions = useRef(new Map<string, number>());
  const currentPath = useRef(pathname);
  const restoring = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    function save() {
      if (!restoring.current) positions.current.set(currentPath.current, window.scrollY);
    }
    window.addEventListener("scroll", save, { passive: true });
    return () => window.removeEventListener("scroll", save);
  }, []);

  // A layout effect runs before the browser fires scroll events for the new page.
  useLayoutEffect(() => {
    if (currentPath.current === pathname) return;
    currentPath.current = pathname;
    noteInAppNavigation();
    if (!shellPaths.includes(pathname)) return;

    const target = positions.current.get(pathname) ?? 0;
    restoring.current = true;
    const started = performance.now();
    let frame = 0;

    const run = ++generation.current;
    const stop = () => {
      cancelAnimationFrame(frame);
      for (const type of userScrollEvents) window.removeEventListener(type, stop);
      // Scroll events from our own scrollTo arrive before the next frame; ignore them too.
      requestAnimationFrame(() => {
        if (generation.current === run) restoring.current = false;
      });
    };
    // Scrolling by hand wins over restoring.
    const userScrollEvents = ["wheel", "touchstart", "keydown"] as const;
    for (const type of userScrollEvents) window.addEventListener(type, stop, { passive: true });

    // Only real scrolling saves a position: on a timeout the page was too short and
    // the clamped position must not overwrite the one Pontus left.
    const attempt = () => {
      window.scrollTo(0, target);
      if (Math.abs(window.scrollY - target) <= 1 || performance.now() - started > restoreForMs) {
        stop();
      } else {
        frame = requestAnimationFrame(attempt);
      }
    };
    attempt();
    return stop;
  }, [pathname]);

  return null;
}
