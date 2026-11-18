"use client";

import Link from "next/link";
import { useOption } from "@/lib/use-option";

/**
 * The one way in under Matsedel: the quiet chip "Äter ni ute?" on the row under the week choice (beside Veckoagentens
 * chip), so it does not depend on how many dishes the week has; shown only when the Tillval Menyrådgivare is on.
 * No icon: the row has to fit 375 px with the agent's chip and an open draft's ⋯.
 */
export function MenuShortcut() {
  const on = useOption("menuAdvisor");
  if (!on) return null;
  return (
    <Link
      href="/matsedel/menyer"
      data-testid="menu-advisor-shortcut"
      className="relative inline-flex min-h-[34px] max-w-full min-w-0 items-center rounded-pill border border-border bg-surface px-3 py-1 text-control font-medium text-ink-2 outline-none before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      Äter ni ute?
    </Link>
  );
}
