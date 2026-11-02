"use client";

import Link from "next/link";
import { type ReactNode, Suspense, useState } from "react";
import { HelpIcon, SettingsIcon, ChevronRightIcon, PenIcon } from "../icons";
import { Sheet } from "../sheet";
import { useAccount, useHasAccount, useSignOutSlots } from "./account";
import { Avatar } from "./avatar";
import { useShellNote } from "./note-slot";
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

/** Skriv en lapp (Story 24.1): a button, as it opens a sheet and goes nowhere. */
function WriteNoteRow({ onClick }: { onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[52px] w-full items-center gap-3 pr-2 pl-3.5 text-left text-item text-ink focus-visible:-outline-offset-2"
      >
        <PenIcon size={22} className="shrink-0 text-ink-2" />
        <span className="min-w-0 flex-1">Skriv en lapp</span>
        <ChevronRightIcon size={16} className="mx-1.5 shrink-0 text-ink-3" />
      </button>
    </li>
  );
}

function AccountSheetButton({ tab }: { tab?: HeaderTab }) {
  const account = useAccount();
  const signOut = useSignOutSlots();
  const note = useShellNote();
  const write = note?.write ?? null;
  const [open, setOpen] = useState(false);
  if (!account) return null;
  const from = mainDestinations.find((destination) => destination.href === tab);
  const tabLabel = from?.label;
  const helpHref = from ? helpHrefFor(from.href) : helpDestination.href;
  const close = () => setOpen(false);
  const title: ReactNode = (
    <span className="flex items-center gap-3">
      <Avatar initial={account.initial} size={40} tone={account.tone} />
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
        aria-label={note?.waiting ? "Konto, en lapp väntar" : "Konto"}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative flex size-tap shrink-0 items-center justify-center rounded-full"
      >
        <Avatar initial={account.initial} tone={account.tone} />
        {/* Story 24.1: a note from someone else waits. */}
        {note?.waiting ? (
          <span aria-hidden="true" data-testid="note-dot" className="absolute top-[7px] right-[7px] size-2.5 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg)]" />
        ) : null}
      </button>
      <Sheet open={open} onClose={close} title={title} initialFocus="title">
        <ul className="mt-1 flex flex-col divide-y divide-hairline overflow-hidden rounded-[14px] bg-fill" role="list">
          {write ? (
            <WriteNoteRow
              onClick={() => {
                close();
                write();
              }}
            />
          ) : null}
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
