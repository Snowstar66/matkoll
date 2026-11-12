"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";

// The plate's emoji ends in the invisible variation selector, which source never holds literally.
const plate = "\u{1F37D}\uFE0F";

/**
 * The one way in under Matsedel: a low row "Äter ute?" directly under the week row (UX-02, variant A), so it
 * does not depend on how many dishes the week has; shown only when the Tillval Menyrådgivare is on.
 */
export function MenuShortcut() {
  const on = useOption("menuAdvisor");
  if (!on) return null;
  return (
    <Link
      href="/matsedel/menyer"
      data-testid="menu-advisor-shortcut"
      className="flex min-h-[3.25rem] items-center gap-3 rounded-lg bg-surface px-4 py-2 text-ink"
    >
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-md bg-tile-clay text-xl">
        {plate}
      </span>
      <span className="min-w-0 flex-1 text-row-title">Äter ute?</span>
      <ChevronRightIcon size={20} className="shrink-0 text-ink-3" />
    </Link>
  );
}
