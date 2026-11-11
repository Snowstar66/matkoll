"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MoreIcon, SlidersIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import type { CostTexts, SettingsActions } from "./actions";
import { redoMenuTexts } from "./format";
import { SettingsSheet } from "./settings-sheet";

// The new ⋯ in Matsedel's header (VK-N1), only for a full week and only with the Tillval Veckoagenten on: "Gör om
// de olåsta" (or "Gör om veckan" when none of the dishes are the household's own) and "Ställ in". A full week has no
// card to disturb it, so this is its one way in. Which days the agent put there is read when the menu opens.

export type WeekAgentMenuProps = {
  /** The proposal screen for the week, asking for a redo: only the days the agent put there are proposed again. */
  redoHref: string;
  /** The weekdays that have a dish; the menu is for a full week only. */
  filledDays: readonly number[];
  emptyDays: readonly number[];
  /** The weekdays whose dish an earlier "Använd veckan" put there; `null` when it cannot be read. */
  loadAgentDays: () => Promise<number[] | null>;
  settings: { actions: SettingsActions; cost: CostTexts };
};

export function WeekAgentMenu({ redoHref, filledDays, emptyDays, loadAgentDays, settings }: WeekAgentMenuProps) {
  const on = useOption("weekAgent");
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentDays, setAgentDays] = useState<number[] | null | undefined>(undefined);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLAnchorElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, agentDays]);

  // Read each time the menu opens: another phone may have changed the week.
  useEffect(() => {
    if (!open) return;
    let live = true;
    loadAgentDays().then(
      (days) => live && setAgentDays(days),
      () => live && setAgentDays(null),
    );
    return () => {
      live = false;
    };
  }, [open, loadAgentDays]);

  if (!on || emptyDays.length > 0 || filledDays.length === 0) return null;

  function close() {
    setOpen(false);
    toggle.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") setOpen(false);
  }

  // Unknown or no agent days: every dish counts as the household's own, and "Gör om veckan" asks before it replaces any.
  const agent = agentDays ? agentDays.filter((day) => filledDays.includes(day)) : [];
  const redo = redoMenuTexts(agent.length > 0 ? agent.length : filledDays.length, agent.length > 0 ? filledDays.length - agent.length : 0);

  return (
    <div ref={root} className="relative flex">
      <button
        ref={toggle}
        type="button"
        aria-label="Fler val för veckan"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="week-agent-menu"
        onClick={() => setOpen((value) => !value)}
        className="flex size-tap items-center justify-center rounded-full text-accent"
      >
        <MoreIcon size={26} />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Fler val för veckan" onKeyDown={onKeyDown} className="absolute top-full right-0 z-30 flex w-72 max-w-[calc(100vw-2rem)] flex-col rounded-lg bg-surface py-1 shadow-float">
          <Link ref={first} href={redoHref} role="menuitem" data-testid="week-agent-redo" className="flex min-h-tap items-start gap-3 px-3.5 py-3 text-accent">
            <SparkleIcon size={22} className="mt-0.5 shrink-0" />
            <span className="flex flex-col text-ink">
              <span className="text-row-title">{redo.title}</span>
              <span className="text-meta text-ink-2">{redo.hint}</span>
            </span>
          </Link>
          <button
            type="button"
            role="menuitem"
            data-testid="week-agent-menu-settings"
            onClick={() => {
              close();
              setSettingsOpen(true);
            }}
            className="flex min-h-tap items-start gap-3 border-t border-hairline px-3.5 py-3 text-left text-accent"
          >
            <SlidersIcon size={22} className="mt-0.5 shrink-0" />
            <span className="flex flex-col text-ink">
              <span className="text-row-title">Ställ in</span>
              <span className="text-meta text-ink-2">Middagar, budget, butiker</span>
            </span>
          </button>
        </div>
      ) : null}
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} actions={settings.actions} cost={settings.cost} />
    </div>
  );
}
