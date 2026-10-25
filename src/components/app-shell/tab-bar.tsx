"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "../cx";
import { currentState, mainDestinations } from "./destinations";

/** Flikfält: the four main surfaces at the bottom, below 1024 px. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-30 h-tab-bar border-t border-border bg-surface pb-[max(env(safe-area-inset-bottom),24px)] desktop:hidden"
    >
      <ul className="grid h-full grid-cols-4">
        {mainDestinations.map(({ href, label, Icon }) => {
          const current = currentState(pathname, href);
          return (
            <li key={href} className="flex">
              {/* scroll={false}: the shell's ScrollMemory puts each surface back where it was. */}
              <Link
                href={href}
                scroll={false}
                aria-current={current}
                className={cx(
                  "flex min-h-tap flex-1 flex-col items-center justify-center gap-[3px] text-tab-label",
                  current ? "font-semibold text-accent" : "text-ink-3",
                )}
              >
                <Icon size={24} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
