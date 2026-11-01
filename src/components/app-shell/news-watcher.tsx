"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect } from "react";
import { badgeOptedIn, showAppBadge } from "@/lib/app-badge";
import { newsTabOf } from "@/lib/news";
import { newsClient, useNews } from "@/lib/news-client";
import { idleAfterMs, idleRefreshMs } from "../use-live-refresh";

// Brickor (Story 23.1) and the app icon's number (Story 23.2): reads what is
// new on Inköpslista and in Förråd when the app opens, when it is shown again
// or back online, on every move between pages, and every half minute while it
// is visible (once a minute when nobody has used it for a while). One small
// GET, much slower than the live pages' own reads. Renders nothing.

/** How often the badges are read while the app is visible and in use. */
export const newsRefreshMs = 30_000;

const activityEvents = ["pointerdown", "keydown", "touchstart"] as const;

export function NewsWatcher() {
  return (
    <Suspense fallback={null}>
      <Watcher />
    </Suspense>
  );
}

function Watcher() {
  const pathname = usePathname();
  const news = useNews();
  const total = news.lista.length + news.prylar.length;

  // The tab open now counts as seen, and so does the one just left.
  useEffect(() => {
    const client = newsClient();
    if (!client) return;
    client.setCurrent(newsTabOf(pathname));
    void client.refresh();
  }, [pathname]);

  useEffect(() => {
    const client = newsClient();
    if (!client) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity = Date.now();

    function loop() {
      clearTimeout(timer);
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const idle = Date.now() - lastActivity >= idleAfterMs;
      timer = setTimeout(() => {
        void client!.refresh();
        loop();
      }, idle ? idleRefreshMs : newsRefreshMs);
    }
    function wake() {
      void client!.refresh();
      loop();
    }
    function onVisibility() {
      if (document.visibilityState === "visible") {
        lastActivity = Date.now();
        wake();
      } else {
        client!.leave();
        clearTimeout(timer);
      }
    }
    function onActivity() {
      lastActivity = Date.now();
    }
    function onPageHide() {
      client!.leave();
    }

    loop();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", wake);
    window.addEventListener("pagehide", onPageHide);
    for (const type of activityEvents) window.addEventListener(type, onActivity, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      for (const type of activityEvents) window.removeEventListener(type, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", wake);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // Story 23.2: the icon shows the same total, and nothing once it is all seen.
  useEffect(() => {
    if (badgeOptedIn()) void showAppBadge(total);
  }, [total]);

  return null;
}
