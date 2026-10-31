"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { MoreIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { deletePantrySite } from "../actions/delete-pantry-site";
import { boendeCardText, selectedBoendeBadge, settingsExplainText } from "../domain/boende-counts";
import { canRemoveSite, type PantrySiteWithCount, removedSiteText } from "../domain/site";
import { SitesSheet } from "./sites-sheet";
import { useHydrated, useLiveUndo } from "./site-switching";
import { useChooseSite } from "./use-choose-site";

/** What Förråd holds in a boende (from the things module, given by the page); the prylar and kort of a card. */
export type SiteThingCounts = { things: number; cards: number };

/**
 * "Boenden" under Inställningar (Story 14.7, an overview since Story 16.14): a
 * card per boende with what is in it ("30 matvaror · 18 prylar · 1 kort"). The
 * selected one has a green border and "Vald". A tap on the card selects it;
 * "Matvaror ›" and "Förråd ›" select it and go there. ⋯ holds "Byt namn" and
 * "Ta bort" (only for an empty boende that is not selected, as before). "Lägg
 * till boende" opens the sheet Boenden, which closes when the page is hidden
 * after a navigation (Activity); a name not saved is dropped.
 */
export function HousingSettings({
  sites,
  thingCounts,
}: {
  sites: readonly PantrySiteWithCount[];
  /** Per boende; `null` when Förråd could not be read, and the cards then say nothing about prylar. */
  thingCounts: Readonly<Record<string, SiteThingCounts>> | null;
}) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { showToast } = useToast();
  const { shownId, choose, error, switching } = useChooseSite(sites);
  const { liveUndoSites } = useLiveUndo();
  const [sheet, setSheet] = useState<{ open: boolean; session: number; renaming: string | null }>({ open: false, session: 0, renaming: null });
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  useLayoutEffect(() => () => setSheet((current) => (current.open ? { ...current, open: false } : current)), []);

  function openSheet(renaming: string | null) {
    setSheet((current) => ({ open: true, session: current.session + 1, renaming }));
  }

  async function go(site: PantrySiteWithCount, href: string) {
    // Already the selected one: nothing to save, only to go there.
    if (site.id === shownId || (await choose(site.id))) router.push(href);
  }

  function remove(site: PantrySiteWithCount) {
    if (removing) return;
    setRemoveError(null);
    startRemoving(async () => {
      let result: Result<{ removed: boolean }>;
      try {
        result = await deletePantrySite({ id: site.id });
      } catch {
        result = fail("pantry_site_failed");
        router.refresh();
      }
      if (result.ok) {
        showToast(removedSiteText(site.name));
      } else if (result.error.code === "unauthorized") {
        router.refresh();
      } else {
        setRemoveError(result.error.message);
      }
    });
  }

  return (
    <section aria-label="Boenden" className="flex flex-col gap-4">
      <p className="px-1 desktop:px-0 text-meta text-ink-3">{settingsExplainText}</p>
      {error || removeError ? <Notice role="alert">{error ?? removeError}</Notice> : null}
      <ul className="flex flex-col gap-2.5">
        {sites.map((site) => {
          const selected = site.id === shownId;
          const things = thingCounts?.[site.id];
          const text = boendeCardText({ items: site.itemCount ?? 0, things: things?.things ?? 0, cards: things?.cards ?? 0 });
          // Förråd could not be read: only what the pantry says, so no "inga prylar än" that may not be true.
          const stats = thingCounts === null || site.itemCount === null ? text.split(" · ").slice(0, thingCounts === null ? 1 : undefined).join(" · ") : text;
          return (
            <li
              key={site.id}
              data-testid="housing-card"
              data-selected={selected || undefined}
              className={cx("flex flex-col gap-2.5 rounded-lg border bg-surface px-4 py-3.5", selected ? "border-accent" : "border-transparent")}
            >
              <div className="flex items-center gap-2">
                {/* A tap before hydration would do nothing, so the name is plain text until then. */}
                <button
                  type="button"
                  disabled={!hydrated || switching}
                  aria-pressed={selected}
                  aria-label={`Välj ${site.name}`}
                  onClick={() => void choose(site.id)}
                  className="flex min-h-tap min-w-0 flex-1 flex-col items-start justify-center text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-row-title break-words text-ink">{site.name}</span>
                    {selected ? <Badge tone="mint">{selectedBoendeBadge}</Badge> : null}
                  </span>
                  <span className="text-meta text-ink-2">{stats}</span>
                </button>
                <CardMenu
                  site={site}
                  disabled={!hydrated || removing}
                  // Empty also in Förråd (unknown counts: not removable), so nothing that was photographed goes with it.
                  canRemove={canRemoveSite({ ...site, isSelected: selected }, sites) && !liveUndoSites.has(site.id) && things !== undefined && things.things + things.cards === 0}
                  onRename={() => openSheet(site.id)}
                  onRemove={() => remove(site)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="compact" className="bg-mint/50" disabled={!hydrated || switching} onClick={() => void go(site, "/hemma")} aria-label={`Matvaror i ${site.name}`}>
                  Matvaror ›
                </Button>
                <Button variant="compact" className="bg-mint/50" disabled={!hydrated || switching} onClick={() => void go(site, "/prylar")} aria-label={`Förråd i ${site.name}`}>
                  Förråd ›
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <div>
        <Button variant="text" disabled={!hydrated} onClick={() => openSheet(null)} className="-ml-3">
          Lägg till boende
        </Button>
      </div>
      <SitesSheet
        open={sheet.open}
        session={sheet.session}
        sites={sites}
        startRenaming={sheet.renaming}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </section>
  );
}

/** ⋯ on a card: "Byt namn", and "Ta bort" when the boende may be removed. Closes with Esc, a tap outside or a choice. */
function CardMenu({
  site,
  disabled,
  canRemove,
  onRename,
  onRemove,
}: {
  site: PantrySiteWithCount;
  disabled: boolean;
  canRemove: boolean;
  onRename: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function pick(action: () => void) {
    // Focus on ⋯ first, so a sheet gives it back when it closes.
    setOpen(false);
    toggle.current?.focus();
    action();
  }

  return (
    <div ref={root} className="relative flex shrink-0" onKeyDown={onKeyDown}>
      <button
        ref={toggle}
        type="button"
        aria-label={`Fler val för ${site.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex size-tap items-center justify-center rounded-full text-ink-2"
      >
        <MoreIcon size={24} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={`Fler val för ${site.name}`}
          className="absolute top-full right-0 z-30 flex min-w-40 flex-col rounded-md border border-hairline bg-surface py-1"
        >
          <button ref={first} type="button" role="menuitem" onClick={() => pick(onRename)} className="min-h-tap px-4 text-left text-body text-ink">
            Byt namn
          </button>
          {canRemove ? (
            <button type="button" role="menuitem" onClick={() => pick(onRemove)} className="min-h-tap px-4 text-left text-body text-ink">
              Ta bort
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
