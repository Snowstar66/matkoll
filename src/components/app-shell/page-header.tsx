import Link from "next/link";
import type { ReactNode } from "react";
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
};

/** Sidrubrik: 34 px bold title with 56 px of air above it on mobile (more under a notch). */
export function PageHeader({ title, action, backHref }: PageHeaderProps) {
  return (
    <header className="flex flex-col pt-[max(var(--header-top-mobile),calc(env(safe-area-inset-top)+12px))] pb-4 desktop:pt-10">
      {backHref ? (
        <Link
          href={backHref}
          scroll={false}
          className="-mt-tap mb-1 -ml-2 flex min-h-tap min-w-tap items-center gap-1 self-start rounded-md px-2 text-body text-accent desktop:mt-0"
        >
          <ChevronLeftIcon size={20} />
          Tillbaka
        </Link>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-page-title text-ink">{title}</h1>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
    </header>
  );
}
