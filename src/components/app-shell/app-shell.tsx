import type { ReactNode } from "react";
import { NewsWatcher } from "./news-watcher";
import { ScrollMemory } from "./scroll-memory";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";

/**
 * App-skal: tab bar at the bottom below 1024 px, side menu on the left from 1024 px,
 * content at most 720 px wide (a page with `data-wide-frame` gets the wider frame from 1024 px, Story 14.8). Renders no user data, so layouts never wait for the
 * session (AD-18).
 */
export function AppShell({
  children,
  jobRows,
  siteSwitch,
}: {
  children: ReactNode;
  /** The job row for AI jobs (Story 12.4): one for the tab bar and one for the side menu; the layout gives them. */
  jobRows?: { bar: ReactNode; side: ReactNode };
  /** The boende button for the side menu (Story 16.14); the layout gives it, since it reads the user's boenden. */
  siteSwitch?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#innehall"
        className="sr-only z-50 rounded-md bg-surface px-4 py-3 text-body text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Hoppa till innehållet
      </a>
      <SideMenu jobRow={jobRows?.side} siteSwitch={siteSwitch} />
      <main
        id="innehall"
        tabIndex={-1}
        className="flex flex-1 flex-col px-page outline-none pb-[calc(var(--tab-bar-height)+var(--gutter-mobile))] desktop:pb-10 desktop:pl-[calc(var(--side-menu-width)+var(--gutter-mobile))]"
      >
        <div className="mx-auto flex w-full max-w-content flex-1 flex-col desktop:has-[[data-wide-frame]]:max-w-frame-wide">{children}</div>
      </main>
      <TabBar jobRow={jobRows?.bar} />
      <ScrollMemory />
      <NewsWatcher />
    </div>
  );
}
