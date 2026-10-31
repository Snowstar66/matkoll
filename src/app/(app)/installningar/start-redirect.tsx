"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { pageForAnchor, settingsPageHref } from "@/features/settings";

/**
 * Story 14.7: a link or bookmark with an old anchor (`/installningar#spara-i-matkoll`)
 * goes to the page that holds it now. The server never sees the hash, so this
 * is done in the browser, before anything else is shown of the start page's
 * right-hand column. On a desktop the column otherwise says what to do.
 */
export function StartRedirect() {
  const router = useRouter();
  useEffect(() => {
    const page = pageForAnchor(window.location.hash);
    if (page) router.replace(settingsPageHref(page));
  }, [router]);
  return <p className="pt-14 text-body text-ink-3 desktop:pt-24">Välj en rad till vänster.</p>;
}
