"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { cx } from "../cx";
import { currentState, type Destination, mainDestinations, settingsDestination } from "./destinations";

function MenuLink({ destination, pathname }: { destination: Destination; pathname: string | null }) {
  const { href, label, Icon } = destination;
  const current = currentState(pathname, href);
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current}
      className={cx(
        "flex min-h-tap items-center gap-3 rounded-md px-3 text-body",
        // Active text in mint-ink: accent on mint is only 4.1:1 (NFR4); the icon keeps the accent.
        current ? "bg-mint font-semibold text-mint-ink [&_svg]:text-accent" : "text-ink-2",
      )}
    >
      <Icon size={22} />
      {label}
    </Link>
  );
}

/**
 * Sidomeny: from 1024 px, the four main surfaces plus Inställningar at the
 * bottom. Like the tab bar, it renders without a current item until the path
 * of a dynamic route is known (AD-18).
 */
export function SideMenu() {
  return (
    <Suspense fallback={<SideMenuNav pathname={null} />}>
      <CurrentSideMenu />
    </Suspense>
  );
}

function CurrentSideMenu() {
  return <SideMenuNav pathname={usePathname()} />;
}

function SideMenuNav({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-y-0 left-0 z-30 hidden w-side-menu flex-col border-r border-border bg-surface px-3 pt-8 pb-6 desktop:flex"
    >
      <p className="px-3 pb-6 text-row-title text-ink">Matkoll</p>
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
