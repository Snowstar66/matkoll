"use client";

import { useSelectedLayoutSegment } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/cx";

/**
 * The frame of Inställningar (Story 14.7). On a phone one thing at a time: the
 * start page, or the page of the row that was tapped. From 1024 px the start
 * page is a left column and the chosen page lies beside it. Both columns are
 * always in the page (the hidden one is only not drawn), so the start page
 * keeps its state when a page is opened and closed.
 */
export function SettingsShell({ menu, children }: { menu: ReactNode; children: ReactNode }) {
  const onPage = useSelectedLayoutSegment() !== null;
  return (
    <div className="flex flex-1 flex-col desktop:grid desktop:grid-cols-[19rem_minmax(0,1fr)] desktop:items-start desktop:gap-8">
      <div className={cx(onPage ? "hidden desktop:block" : "block")} data-testid="settings-menu">
        {menu}
      </div>
      <div className={cx("flex-1", onPage ? "flex flex-col" : "hidden desktop:flex desktop:flex-col")} data-testid="settings-page">
        {children}
      </div>
    </div>
  );
}
