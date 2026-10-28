"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { hasInAppHistory } from "./in-app-history";

export type BackLinkProps = {
  /** Where to go when there is no page of Matkoll to go back to (opened by a link, after a reload). */
  fallbackHref: string;
  className?: string;
  children: ReactNode;
};

/**
 * "Tillbaka" that goes back in history when the page was reached within
 * Matkoll (a recipe opened from Matsedel goes back to Matsedel, with its scroll
 * and state), and otherwise to `fallbackHref` (Story 11.6). A link, so it works
 * before hydration and opens in a new tab with a modifier key.
 */
export function BackLink({ fallbackHref, className, children }: BackLinkProps) {
  const router = useRouter();

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (!hasInAppHistory()) return;
    event.preventDefault();
    router.back();
  }

  return (
    <Link href={fallbackHref} scroll={false} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
