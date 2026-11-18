"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { MoreIcon, SlidersIcon, SparkleIcon } from "@/components/icons";
import { useOption } from "@/lib/use-option";
import type { CostTexts, SettingsActions } from "./actions";
import { redoMenuTexts } from "./format";
import { SettingsSheet } from "./settings-sheet";

// The ⋯ in Matsedel's header (VK-N1), only with the Tillval Veckoagenten on. On a full week: "Gör om de olåsta" (or
// "Gör om veckan" when none of the dishes are the household's own) and "Ställ in". On any other week (the row under the
// week choice has "Föreslå veckan" there): "Ställ in" alone, the way to change the choices without making a proposal.
// Which days the agent put there is read when the menu opens, for a full week.

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
  const first = useRef<HTMLElement>(null);
  const menuId = useId();
  /** A full week is the one the agent can redo; any other week only has the settings. */
  const full = emptyDays.length === 0 && filledDays.length > 0;

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
    if (!open || !full) return;
    let live = true;
    loadAgentDays().then(
      (days) => live && setAgentDays(days),
      () => live && setAgentDays(null),
    );
    return () => {
      live = false;
    };
  }, [open, full, loadAgentDays]);

  if (!on || (emptyDays.length === 0 && filledDays.length === 0)) return null;

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
          {full ? (
            <Link ref={first as React.RefObject<HTMLAnchorElement>} href={redoHref} role="menuitem" data-testid="week-agent-redo" className="flex min-h-tap items-start gap-3 px-3.5 py-3 text-accent">
              <SparkleIcon size={22} className="mt-0.5 shrink-0" />
              <span className="flex flex-col text-ink">
                <span className="text-row-title">{redo.title}</span>
                <span className="text-meta text-ink-2">{redo.hint}</span>
              </span>
            </Link>
          ) : null}
          <button
            ref={full ? undefined : (first as React.RefObject<HTMLButtonElement>)}
            type="button"
            role="menuitem"
            data-testid="week-agent-menu-settings"
            onClick={() => {
              close();
              setSettingsOpen(true);
            }}
            className={`flex min-h-tap items-start gap-3 px-3.5 py-3 text-left text-accent ${full ? "border-t border-hairline" : ""}`}
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
