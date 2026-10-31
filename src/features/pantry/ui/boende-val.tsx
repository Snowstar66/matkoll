"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, PinIcon } from "@/components/icons";
import { cx } from "@/components/cx";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { type BoendeCounts, boendeMenuText, boendeSheetTitle, manageBoendenText } from "../domain/boende-counts";
import type { PantrySite } from "../domain/site";
import { useHydrated } from "./site-switching";
import { useChooseSite } from "./use-choose-site";

// Boendet i sidomenyn (Story 16.14): the selected boende as a discreet button
// with a pin, its name and a chevron. In the side menu (variant `side`, from
// 1024 px) it opens a popover; under the page title on a phone (variant `page`,
// below 1024 px; there is no side menu) it opens a bottom sheet with the same
// content: each boende with what is in it, a check at the selected one and
// "Hantera boenden ›". With one boende there is nothing to choose, so nothing
// shows. The selection itself is the one from Story 8.2 (useChooseSite, AD-24).

export type BoendeValProps = {
  variant: "side" | "page";
  /** Every boende of the user's, in the order they were created. */
  sites: readonly PantrySite[];
  /** What each boende holds, read when the menu opens (a Server Action); `null` when it cannot be read. */
  loadCounts: () => Promise<Record<string, BoendeCounts> | null>;
};

/**
 * The rows of the one boende sheet (Story 19.2): each boende with what is in it, a check at the
 * selected one and "Hantera boenden ›" last. The side menu's popover and the sheet on a phone
 * (BoendeVal) and the sheet in Inköpslista (ListSiteLine) all show this.
 */
export function BoendeList({
  sites,
  shownId,
  counts,
  onChoose,
  onManage,
  role,
  disabled = false,
  savingId = null,
  rowRef,
}: {
  sites: readonly PantrySite[];
  shownId: string;
  counts: Record<string, BoendeCounts> | null;
  onChoose: (id: string) => void;
  onManage: () => void;
  role: "menu" | "plain";
  /** A choice is on its way: every row waits. */
  disabled?: boolean;
  /** The boende being saved, which says "Sparar …" instead of the check. */
  savingId?: string | null;
  /** Hands over each row's button, for focus after a failure. */
  rowRef?: (id: string, element: HTMLButtonElement | null) => void;
}) {
  const menu = role === "menu";
  return (
    <div role={menu ? "menu" : "group"} aria-label={boendeSheetTitle} className="flex flex-col">
      {sites.map((site) => {
        const checked = site.id === shownId;
        const sub = counts?.[site.id];
        return (
          <button
            key={site.id}
            ref={rowRef ? (element) => rowRef(site.id, element) : undefined}
            type="button"
            disabled={disabled}
            role={menu ? "menuitemradio" : undefined}
            aria-checked={menu ? checked : undefined}
            aria-pressed={menu ? undefined : checked}
            data-testid="boende-option"
            onClick={() => onChoose(site.id)}
            className={cx(
              "flex min-h-[3.5rem] items-center gap-2.5 rounded-md px-3 py-2 text-left disabled:opacity-60 desktop:min-h-12",
              checked && "bg-mint/50",
            )}
          >
            <span className="flex min-w-0 flex-col">
              <span className="text-body font-medium break-words text-ink desktop:text-[0.9375rem]">{site.name}</span>
              {sub ? <span className="text-meta text-ink-2">{boendeMenuText(sub)}</span> : null}
            </span>
            {site.id === savingId ? (
              <span className="ml-auto shrink-0 text-meta text-ink-2">Sparar …</span>
            ) : checked ? (
              <CheckIcon size={18} className="ml-auto shrink-0 text-accent" />
            ) : null}
          </button>
        );
      })}
      <Link
        href="/installningar/boenden"
        scroll={false}
        role={menu ? "menuitem" : undefined}
        onClick={onManage}
        className="mt-1.5 flex min-h-tap items-center justify-between border-t border-hairline px-3 pt-1 text-body font-medium text-accent"
      >
        {manageBoendenText}
        <span aria-hidden="true">›</span>
      </Link>
    </div>
  );
}

/** The button, and the popover or sheet it opens; see the comment at the top. */
export function BoendeVal({ variant, sites, loadCounts }: BoendeValProps) {
  const hydrated = useHydrated();
  const { shownId, choose, error, switching } = useChooseSite(sites);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, BoendeCounts> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const usedKeyboard = useRef(false);
  const menuId = useId();
  const side = variant === "side";

  // The counts are read each time the menu opens, so they are never older than the tap.
  useEffect(() => {
    if (!open) return;
    let current = true;
    loadCounts()
      .then((loaded) => {
        if (current && loaded) setCounts(loaded);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [open, loadCounts]);

  useEffect(() => {
    if (!open || !side) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, side]);

  useEffect(() => {
    // Only a keyboard user is moved into the menu; a mouse click leaves no focus ring behind.
    if (open && side && usedKeyboard.current) root.current?.querySelector<HTMLElement>("[role=menuitemradio]")?.focus();
  }, [open, side]);

  if (sites.length < 2) return null;
  const shown = sites.find((site) => site.id === shownId) ?? sites[0];

  function returnFocus() {
    if (usedKeyboard.current) toggle.current?.focus();
  }

  function close() {
    setOpen(false);
    returnFocus();
  }

  function onChoose(id: string) {
    setOpen(false);
    returnFocus();
    if (id !== shownId) void choose(id);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    usedKeyboard.current = true;
    if (!side) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  const list = (
    <BoendeList
      sites={sites}
      shownId={shownId}
      counts={counts}
      onChoose={onChoose}
      onManage={() => setOpen(false)}
      role={side ? "menu" : "plain"}
    />
  );

  return (
    <div
      ref={root}
      data-testid={`boende-${variant}`}
      className={cx("relative", side ? "hidden desktop:block" : "desktop:hidden")}
      onKeyDown={onKeyDown}
      onPointerDown={() => {
        usedKeyboard.current = false;
      }}
    >
      <button
        ref={toggle}
        type="button"
        aria-label={`Boende: ${shown.name}`}
        aria-haspopup={side ? "menu" : "dialog"}
        aria-expanded={open}
        aria-controls={open && side ? menuId : undefined}
        disabled={!hydrated || switching}
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "flex items-center rounded-md text-ink-2",
          // In the side menu a full-width row, its pin in the icon column of the items below; on a phone "📍 Hemma ⌄" under the title.
          side ? "min-h-11 w-full gap-3 px-3 text-left text-body" : "-ml-1.5 min-h-tap gap-1 px-1.5 text-meta",
          open && side && "bg-mint text-mint-ink",
        )}
      >
        <PinIcon size={side ? 22 : 14} />
        <span className="min-w-0 break-words">{shown.name}</span>
        <ChevronDownIcon size={14} className={side ? "ml-auto" : undefined} />
      </button>
      {error ? <Notice role="alert">{error}</Notice> : null}
      {side && open ? (
        <div
          id={menuId}
          className="absolute top-full left-0 z-40 mt-1 w-[16.75rem] rounded-lg bg-surface p-1.5 shadow-float ring-1 ring-hairline"
        >
          {list}
        </div>
      ) : null}
      {!side ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={boendeSheetTitle}>
          {list}
        </Sheet>
      ) : null}
    </div>
  );
}
