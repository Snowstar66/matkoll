"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { AppLogo } from "../app-logo";
import { cx } from "../cx";
import { DestinationIcon } from "./destination-icon";
import { useAccount, useHasAccount, useSignOutSlots } from "./account";
import { Avatar } from "./avatar";
import { currentState, type Destination, helpDestination, helpHref, mainDestinations, settingsDestination } from "./destinations";
import { badgeName, TabBadge, useBadgeCount } from "./tab-badge";
import { appName } from "@/app/app-info";

function MenuLink({ destination, pathname, to }: { destination: Destination; pathname: string | null; /** Where the link goes when that is not `destination.href` (Hjälp och tips opens on a section). */ to?: string }) {
  const { href, label } = destination;
  const current = currentState(pathname, href);
  // Story 12.4 and 23.1: unseen AI results and news from others, never on the surface he is on.
  const badge = useBadgeCount(destination, current !== undefined);
  return (
    <Link
      href={to ?? href}
      scroll={false}
      aria-current={current}
      aria-label={badge > 0 ? badgeName(label, badge, destination.badgeUnit) : undefined}
      className={cx(
        "flex min-h-tap items-center gap-3 rounded-md px-3 text-body focus-visible:-outline-offset-2",
        // Active text in mint-ink: accent on mint is only 4.1:1 (NFR4).
        current ? "bg-mint font-medium text-mint-ink" : "font-medium text-ink-2",
      )}
    >
      <div className="relative">
        <DestinationIcon destination={destination} current={current !== undefined} size={22} />
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
      {/* The boende under the name (Story 16.14, Story 19.2): a full-width row whose pin sits in the icon column of the items below; nothing, and no space, with one boende. */}
      {siteSwitch ? <div className="-mt-3 pb-3 empty:hidden">{siteSwitch}</div> : null}
      {jobRow ? <div className="pb-4">{jobRow}</div> : null}
      <ul className="flex flex-col gap-1">
        {mainDestinations.map((destination) => (
          <li key={destination.href}>
            <MenuLink destination={destination} pathname={pathname} />
          </li>
        ))}
      </ul>
      {/* Story 19.2: the account's own things at the bottom, under a hairline: who is signed in, Hjälp och tips (on the section of the page I am on), Inställningar and Logga ut. */}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-hairline pt-2.5">
        <AccountRow />
        <MenuLink destination={helpDestination} pathname={pathname} to={helpHref(pathname)} />
        <MenuLink destination={settingsDestination} pathname={pathname} />
        <SignOutRow />
      </div>
    </nav>
  );
}

function AccountWho() {
  const account = useAccount();
  if (!account) return null;
  return (
    <p className="flex items-center gap-2.5 px-3 pt-1.5 pb-2" data-testid="side-account">
      <Avatar initial={account.initial} size={28} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-control text-ink">{account.name}</span>
        <span className="truncate text-badge text-ink-3">{account.email}</span>
      </span>
    </p>
  );
}

function AccountRow() {
  if (!useHasAccount()) return null;
  return (
    <Suspense fallback={<span aria-hidden="true" inert className="block h-11" />}>
      <AccountWho />
    </Suspense>
  );
}

function SignOutRow() {
  return useSignOutSlots()?.menu ?? null;
}
