"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { cx } from "../cx";
import { currentState, type Destination, mainDestinations, settingsDestination } from "./destinations";
import { badgeName, TabBadge, useAiBadgeCount } from "./tab-badge";

function MenuLink({ destination, pathname }: { destination: Destination; pathname: string | null }) {
  const { href, label, Icon } = destination;
  const current = currentState(pathname, href);
  // Story 12.4: finished AI results that Pontus has not seen, never on the surface he is on.
  const badge = useAiBadgeCount(destination, current !== undefined);
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current}
      aria-label={badge > 0 ? badgeName(label, badge) : undefined}
      className={cx(
        "flex min-h-tap items-center gap-3 rounded-md px-3 text-body",
        // Active text in mint-ink: accent on mint is only 4.1:1 (NFR4); the icon keeps the accent.
        current ? "bg-mint font-semibold text-mint-ink [&_svg]:text-accent" : "text-ink-2",
      )}
    >
      <div className="relative">
        <Icon size={22} />
        <TabBadge count={badge} />
      </div>
      {label}
    </Link>
  );
}

/**
 * Sidomeny: from 1024 px, the four main surfaces plus Inställningar at the
 * bottom. Like the tab bar, it renders without a current item until the path
 * of a dynamic route is known (AD-18). `jobRow` is the job row for AI jobs
 * (Story 12.4), at the top under "Matkoll".
 */
export function SideMenu({ jobRow }: { jobRow?: ReactNode }) {
  return (
    <Suspense fallback={<SideMenuNav pathname={null} jobRow={jobRow} />}>
      <CurrentSideMenu jobRow={jobRow} />
    </Suspense>
  );
}

function CurrentSideMenu({ jobRow }: { jobRow?: ReactNode }) {
  return <SideMenuNav pathname={usePathname()} jobRow={jobRow} />;
}

function SideMenuNav({ pathname, jobRow }: { pathname: string | null; jobRow?: ReactNode }) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-y-0 left-0 z-30 hidden w-side-menu flex-col border-r border-border bg-surface px-3 pt-8 pb-6 desktop:flex"
    >
      <p className="px-3 pb-6 text-row-title text-ink">Matkoll</p>
      {jobRow ? <div className="pb-4">{jobRow}</div> : null}
      <ul className="flex flex-col gap-1">
        {mainDestinations.map((destination) => (
          <li key={destination.href}>
            <MenuLink destination={destination} pathname={pathname} />
          </li>
        ))}
      </ul>
      <ul className="mt-auto flex flex-col">
        <li>
          <MenuLink destination={settingsDestination} pathname={pathname} />
        </li>
      </ul>
    </nav>
  );
}
