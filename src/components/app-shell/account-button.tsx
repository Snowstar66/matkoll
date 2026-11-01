"use client";

import Link from "next/link";
import { type ReactNode, Suspense, useState } from "react";
import { HelpIcon, SettingsIcon, ChevronRightIcon } from "../icons";
import { Sheet } from "../sheet";
import { useAccount, useHasAccount, useSignOutSlots } from "./account";
import { Avatar } from "./avatar";
import { type Destination, helpDestination, helpHref as helpHrefFor, mainDestinations, settingsDestination } from "./destinations";

/** The tabs that have a P button in their header, by address. */
export type HeaderTab = (typeof mainDestinations)[number]["href"];

function SheetRow({ href, Icon, label, value, onClick }: { href: string; Icon: Destination["Icon"]; label: string; value?: string; onClick: () => void }) {
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        onClick={onClick}
        className="flex min-h-[52px] items-center gap-3 pr-2 pl-3.5 text-item text-ink focus-visible:-outline-offset-2"
      >
        <Icon size={22} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">{label}</span>
        {value ? <span className="max-w-[150px] truncate text-control text-ink-3">{value}</span> : null}
        <ChevronRightIcon size={16} className="mx-1.5 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

function AccountSheetButton({ tab }: { tab?: HeaderTab }) {
  const account = useAccount();
  const signOut = useSignOutSlots();
  const [open, setOpen] = useState(false);
  if (!account) return null;
  const from = mainDestinations.find((destination) => destination.href === tab);
  const tabLabel = from?.label;
  const helpHref = from ? helpHrefFor(from.href) : helpDestination.href;
  const close = () => setOpen(false);
  const title: ReactNode = (
    <span className="flex items-center gap-3">
      <Avatar initial={account.initial} size={40} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{account.name}</span>
        <span className="truncate text-meta font-normal text-ink-2">{account.email}</span>
      </span>
    </span>
  );
  return (
    <>
      <button
        type="button"
        aria-label="Konto"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex size-tap shrink-0 items-center justify-center rounded-full"
      >
        <Avatar initial={account.initial} />
      </button>
      <Sheet open={open} onClose={close} title={title} initialFocus="title">
        <ul className="mt-1 flex flex-col divide-y divide-hairline overflow-hidden rounded-[14px] bg-fill" role="list">
          <SheetRow href={settingsDestination.href} Icon={SettingsIcon} label={settingsDestination.label} onClick={close} />
          <SheetRow
            href={helpHref}
            Icon={HelpIcon}
            label={helpDestination.label}
            value={tabLabel ? `Om ${tabLabel}` : undefined}
            onClick={close}
          />
        </ul>
        <div className="mt-4">{signOut?.sheet}</div>
      </Sheet>
    </>
  );
}

/** The size of the P button, held while the account is read, so the header never moves. */
function Placeholder() {
  return <span aria-hidden="true" inert className="size-tap shrink-0" />;
}

/**
 * The P button at the right of a tab's header (Story 19.2): a small round avatar
 * with the account's initial that opens a sheet with Inställningar, Hjälp och
 * tips and Logga ut. On a desktop those three are at the bottom of the side
 * menu, so there is no button. Nothing without an account.
 */
export function AccountButton({ tab }: { tab?: HeaderTab }) {
  const hasAccount = useHasAccount();
  if (!hasAccount) return null;
  return (
    <span className="desktop:hidden">
      <Suspense fallback={<Placeholder />}>
        <AccountSheetButton tab={tab} />
      </Suspense>
    </span>
  );
}
