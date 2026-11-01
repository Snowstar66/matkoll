"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AppLogo } from "../app-logo";
import { cx } from "../cx";
import { currentState, type Destination, mainDestinations, settingsDestination } from "./destinations";
import { badgeName, TabBadge, useAiBadgeCount } from "./tab-badge";
import { appName } from "@/app/app-info";

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
        "flex min-h-tap items-center gap-3 rounded-md px-3 text-body focus-visible:-outline-offset-2",
        // Active text in mint-ink: accent on mint is only 4.1:1 (NFR4).
        current ? "bg-mint font-medium text-mint-ink" : "font-medium text-ink-2",
      )}
    >
      <div className="relative">
        <Icon size={22} tinted={current !== undefined} />
        <TabBadge count={badge} />
      </div>
      {label}
    </Link>
  );
}

/**
 * Sidomeny: from 1024 px, the five main surfaces plus Inställningar at the
 * bottom. Like the tab bar, it renders without a current item until the path
 * of a dynamic route is known (AD-18). `jobRow` is the job row for AI jobs
 * (Story 12.4), at the top under "Matkoll". `siteSwitch` is the boende button (Story 16.14), right under the name.
 */
export function SideMenu({ jobRow, siteSwitch }: { jobRow?: ReactNode; siteSwitch?: ReactNode }) {
  return (
    <Suspense fallback={<SideMenuNav pathname={null} jobRow={jobRow} siteSwitch={siteSwitch} />}>
      <CurrentSideMenu jobRow={jobRow} siteSwitch={siteSwitch} />
    </Suspense>
  );
}

function CurrentSideMenu({ jobRow, siteSwitch }: { jobRow?: ReactNode; siteSwitch?: ReactNode }) {
  return <SideMenuNav pathname={usePathname()} jobRow={jobRow} siteSwitch={siteSwitch} />;
}

function SideMenuNav({ pathname, jobRow, siteSwitch }: { pathname: string | null; jobRow?: ReactNode; siteSwitch?: ReactNode }) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-y-0 left-0 z-30 hidden w-side-menu flex-col border-r border-border bg-surface px-3 pt-8 pb-6 desktop:flex"
    >
      <p className="flex items-center gap-2 px-3 pb-6 text-row-title text-ink">
        <AppLogo />
        {appName}
      </p>
      {/* The boende under the name (Story 16.14); nothing, and no space, with one boende. */}
      {siteSwitch ? <div className="-mt-5 pb-3 pl-12 empty:hidden">{siteSwitch}</div> : null}
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
