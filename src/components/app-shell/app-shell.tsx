import type { ReactNode } from "react";
import { ScrollMemory } from "./scroll-memory";
import { SideMenu } from "./side-menu";
import { TabBar } from "./tab-bar";

/**
 * App-skal: tab bar at the bottom below 1024 px, side menu on the left from 1024 px,
 * content at most 720 px wide. Renders no user data, so layouts never wait for the
 * session (AD-18).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#innehall"
        className="sr-only z-50 rounded-md bg-surface px-4 py-3 text-body text-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Hoppa till innehållet
      </a>
      <SideMenu />
      <main
        id="innehall"
        tabIndex={-1}
        className="flex flex-1 flex-col px-page outline-none pb-[calc(var(--tab-bar-height)+var(--gutter-mobile))] desktop:pb-10 desktop:pl-[calc(var(--side-menu-width)+var(--gutter-mobile))]"
      >
        <div className="mx-auto flex w-full max-w-content flex-1 flex-col">{children}</div>
      </main>
      <TabBar />
      <ScrollMemory />
    </div>
  );
}
