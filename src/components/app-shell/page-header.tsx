import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../cx";
import { ChevronLeftIcon } from "../icons";

export type PageHeaderProps = {
  title: string;
  /** A round 44 px button or link at the right, e.g. the gear or "+". */
  action?: ReactNode;
  /**
   * A "Tillbaka" link above the title to the page above, for every page under a
   * tab (Inställningar, Tidigare matsedlar, an earlier plan). Shown at every
   * width: Matkoll on the home screen has no browser back button (AD-27), on an
   * iPad as on a phone.
   */
  backHref?: string;
  /** The words of the back link when it is not "Tillbaka", e.g. "Inställningar" on a subpage (Story 14.7). */
  backLabel?: string;
  /** The back link is only for a phone: on a desktop the page above is beside this one (Story 14.7). */
  backOnlyOnMobile?: boolean;
};

/** Sidrubrik: 34 px bold title with 56 px of air above it on mobile (more under a notch). */
export function PageHeader({ title, action, backHref, backLabel = "Tillbaka", backOnlyOnMobile = false }: PageHeaderProps) {
  return (
    <header className="flex flex-col pt-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] pb-4 desktop:pt-10">
      {backHref ? (
        <Link
          href={backHref}
          scroll={false}
          className={cx(
            "-mt-tap mb-1 -ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-accent desktop:mt-0",
            backOnlyOnMobile && "desktop:hidden",
          )}
        >
          <ChevronLeftIcon size={20} />
          {backLabel}
        </Link>
      ) : null}
      {/* The title takes the room the actions leave and wraps between its words there. Only
          when its longest word and the actions cannot share the row (a phone at 200 % zoom)
          do the actions move to a row of their own; a word wider than the page breaks. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
        <h1 className="max-w-full min-w-0 flex-[1_1_min-content] text-page-title break-words text-ink">
          {title}
        </h1>
        {action ? <div className="ml-auto flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
    </header>
  );
}
