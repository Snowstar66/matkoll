"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar } from "@/components/app-shell/avatar";
import { cx } from "@/components/cx";
import { BookmarkIcon, ChevronRightIcon, CoinIcon, GlobeIcon, InfoIcon, InstallIcon, MicIcon, PinIcon, SparkleIcon, StoreIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";

/** The line icons of the rows (Story 19.7); a name, since the page's server part cannot hand over a component. */
export const settingsIcons = {
  pin: PinIcon,
  store: StoreIcon,
  globe: GlobeIcon,
  bookmark: BookmarkIcon,
  sparkle: SparkleIcon,
  coin: CoinIcon,
  install: InstallIcon,
  mic: MicIcon,
  info: InfoIcon,
} as const;

export type SettingsIconName = keyof typeof settingsIcons;

/** The tile's tint: mint, sky, sand or lilac (Story 19.7), with its ink for the line icon. */
const tileTints = {
  mint: "bg-mint text-mint-ink",
  sky: "bg-sky text-sky-ink",
  sand: "bg-sand text-sand-ink",
  lilac: "bg-tile-lilac text-ink-2",
  plain: "bg-fill text-ink-2",
} as const;

/** One row of the start page: a tinted tile with a line icon, the name, a short value and a small arrow. */
export type SettingsRowData = {
  /** The page under Inställningar the row opens, or null for a row that only shows a value. */
  href: string | null;
  icon: SettingsIconName;
  tile: keyof typeof tileTints;
  title: string;
  /** The short value at the right, e.g. "Hemma, Duved"; left out when there is none. */
  value?: string;
};

export type SettingsGroupData = {
  /** The label above the group. */
  label: string;
  rows: readonly SettingsRowData[];
};

/** The account as a card at the top (Story 19.7): avatar, name and e-mail; opens the account page. */
export type SettingsAccountData = { href: string; name: string; email: string; initial: string };

const rowClasses = "flex min-h-[52px] items-center gap-3 px-4 py-1.5 focus-visible:-outline-offset-2";

function Tile({ icon, tile }: Pick<SettingsRowData, "icon" | "tile">) {
  const Icon = settingsIcons[icon];
  return (
    <span aria-hidden="true" className={cx("flex size-[30px] shrink-0 items-center justify-center rounded-[8px]", tileTints[tile])}>
      <Icon size={18} />
    </span>
  );
}

function Row({ row, current }: { row: SettingsRowData; current: boolean }) {
  const content = (
    <>
      <Tile icon={row.icon} tile={row.tile} />
      <span className="min-w-0 flex-1 text-row-title font-normal wrap-break-word text-ink">{row.title}</span>
      {row.value ? (
        <span className="max-w-[45%] truncate text-[15px] leading-5 text-ink-2" data-testid="settings-value">
          {row.value}
        </span>
      ) : null}
      {row.href ? <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" /> : null}
    </>
  );
  if (!row.href) return <li className={rowClasses}>{content}</li>;
  return (
    <li>
      <Link
        href={row.href}
        aria-current={current ? "page" : undefined}
        className={cx(rowClasses, current && "bg-mint")}
        data-testid="settings-row"
      >
        {content}
      </Link>
    </li>
  );
}

function AccountCard({ account, current }: { account: SettingsAccountData; current: boolean }) {
  return (
    <ListGroup label="Konto">
      <li>
        <Link
          href={account.href}
          aria-current={current ? "page" : undefined}
          className={cx("flex min-h-16 items-center gap-3 px-4 py-2 focus-visible:-outline-offset-2", current && "bg-mint")}
          data-testid="settings-row"
        >
          <Avatar initial={account.initial} size={40} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-row-title text-ink">{account.name}</span>
            <span className="truncate text-meta text-ink-2">{account.email}</span>
          </span>
          <ChevronRightIcon size={16} className="-mr-1 shrink-0 text-ink-3" />
        </Link>
      </li>
    </ListGroup>
  );
}

/**
 * The start page of Inställningar (Story 14.7, 19.7): the account as a card, then grouped rows in the same list
 * cards as the rest of the app, each with a tinted tile, a short value and a small arrow, then
 * `signOut` in a group of its own. On a desktop the row of the open page is
 * marked (the page is beside the list).
 */
export function SettingsMenu({ account, groups, signOut }: { account: SettingsAccountData; groups: readonly SettingsGroupData[]; signOut: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-3 pb-2">
      <AccountCard account={account} current={pathname === account.href} />
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h2 className="px-1 desktop:px-0 text-section-label text-ink-2">{group.label}</h2>
          <ListGroup label={group.label} inset={58}>
            {group.rows.map((row) => (
              <Row key={row.title} row={row} current={row.href !== null && pathname === row.href} />
            ))}
          </ListGroup>
        </section>
      ))}
      {signOut}
    </div>
  );
}
