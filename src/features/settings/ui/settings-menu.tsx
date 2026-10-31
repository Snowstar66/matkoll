"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "@/components/cx";
import { ListGroup } from "@/components/list-group";

/** One row of the start page: a tile with an emoji, the name, a short value and › . */
export type SettingsRowData = {
  /** The page under Inställningar the row opens, or null for a row that only shows a value. */
  href: string | null;
  /** The emoji in the tile; decoration. */
  icon: string;
  /** The tile's background token. */
  tile: "bg-mint" | "bg-sand" | "bg-tile-clay" | "bg-sky" | "bg-tile-lilac" | "bg-hairline";
  title: string;
  /** The short value at the right, e.g. "Hemma, Duved"; left out when there is none. */
  value?: string;
};

export type SettingsGroupData = {
  /** The label above the group. */
  label: string;
  rows: readonly SettingsRowData[];
};

const rowClasses = "flex min-h-12 items-center gap-3 px-4 py-1.5 focus-visible:-outline-offset-2";

function Tile({ icon, tile }: Pick<SettingsRowData, "icon" | "tile">) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex size-tile shrink-0 items-center justify-center rounded-sm text-tile-icon leading-none select-none",
        tile,
      )}
    >
      {icon}
    </span>
  );
}

function Row({ row, current }: { row: SettingsRowData; current: boolean }) {
  const content = (
    <>
      <Tile icon={row.icon} tile={row.tile} />
      <span className="min-w-0 flex-1 text-body wrap-break-word text-ink">{row.title}</span>
      {row.value ? (
        <span className="max-w-[45%] truncate text-body text-ink-3" data-testid="settings-value">
          {row.value}
        </span>
      ) : null}
      {row.href ? (
        <span aria-hidden="true" className="-mr-1 text-row-title text-ink-3">
          ›
        </span>
      ) : null}
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

/**
 * The start page of Inställningar (Story 14.7): grouped rows in the same list
 * cards as the rest of the app, each with a tile, a short value and ›, then
 * `signOut` in a group of its own. On a desktop the row of the open page is
 * marked (the page is beside the list).
 */
export function SettingsMenu({ groups, signOut }: { groups: readonly SettingsGroupData[]; signOut: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-col gap-3 pb-2">
      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-section-label text-ink-2">{group.label}</h2>
          <ListGroup label={group.label}>
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
