"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, type ReactNode, Suspense } from "react";
import { cx } from "../cx";
import { DestinationIcon } from "./destination-icon";
import { currentState, type Destination, mainDestinations } from "./destinations";
import { badgeName, TabBadge, useAiBadgeCount } from "./tab-badge";

/**
 * Flikfält: the five main surfaces at the bottom, below 1024 px. On a route
 * with a dynamic segment (/recept/[id]) the path is known only at request
 * time, so the bar first renders without a current tab (AD-18). `jobRow` is
 * the job row for AI jobs (Story 12.4), which sits in the bar above the tabs.
 */
export function TabBar({ jobRow }: { jobRow?: ReactNode }) {
  return (
    <Suspense fallback={<TabBarNav pathname={null} jobRow={jobRow} />}>
      <CurrentTabBar jobRow={jobRow} />
    </Suspense>
  );
}

function CurrentTabBar({ jobRow }: { jobRow?: ReactNode }) {
  return <TabBarNav pathname={usePathname()} jobRow={jobRow} />;
}

function TabLink({ destination, pathname }: { destination: Destination; pathname: string | null }) {
  const { href, label, labelParts } = destination;
  const current = currentState(pathname, href);
  // Story 12.4: finished AI results that Pontus has not seen, never on the tab he is on.
  const badge = useAiBadgeCount(destination, current !== undefined);
  return (
    // scroll={false}: the shell's ScrollMemory puts each surface back where it was.
    <Link
      href={href}
      scroll={false}
      aria-current={current}
      aria-label={badge > 0 ? badgeName(label, badge) : undefined}
      className={cx(
        "group flex min-h-tap min-w-0 flex-1 flex-col items-center justify-center text-tab-label outline-none",
        current ? "font-semibold text-accent" : "text-ink-3",
      )}
    >
      {/* The focus ring is drawn round the icon and the label, never as a box over the whole tab. */}
      <div className="flex max-w-full flex-col items-center gap-0.5 rounded-md px-1 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-accent">
        {/* A div and a badge that is no span: the label stays the first span of the link. */}
        <div className="relative flex">
          <DestinationIcon destination={destination} current={current !== undefined} size={24} />
          <TabBadge count={badge} />
        </div>
        {/* Story 10.4: a long label breaks between its parts, never inside a word, when the tab is narrow. */}
        <span className="max-w-full text-center">
          {(labelParts ?? [label]).map((part, index) => (
            <Fragment key={part}>
              {index > 0 ? <wbr /> : null}
              {part}
            </Fragment>
          ))}
        </span>
      </div>
    </Link>
  );
}

function TabBarNav({ pathname, jobRow }: { pathname: string | null; jobRow?: ReactNode }) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-tab-bar flex-col border-t-[0.5px] border-border bg-bar pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px] backdrop-saturate-150 desktop:hidden"
    >
      {jobRow}
      {/* Story 10.4: at least the bar's height; it grows rather than let a label run into the safe area. */}
      <ul className="grid flex-1 grid-cols-5">
        {mainDestinations.map((destination) => (
          <li key={destination.href} className="flex">
            <TabLink destination={destination} pathname={pathname} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
