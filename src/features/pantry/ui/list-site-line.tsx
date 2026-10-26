"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent, startTransition, useLayoutEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { selectPantrySite } from "../actions/select-pantry-site";
import {
  listCountedAgainstText,
  type PantrySite,
  type SelectedSite,
  siteLineText,
  switchListButtonLabel,
  switchListButtonText,
  switchListTitle,
} from "../domain/site";
import { useHydrated } from "./site-switching";

// The line "Lager: Hemma" and "Byt" in Inköpslista (FR-32, Story 8.5,
// EXPERIENCE.md, Flöde 6): with more than one place, under the page title,
// the place the list is counted against and the text button "Byt", which
// opens the sheet Byt ställe ("Räkna listan mot"). A tap on a place there
// selects it with selectPantrySite, the same selection as the pills in Hemma
// (AD-24): the list has no place of its own, and the choice holds for the
// whole app until Pontus switches again. The page renders this beside
// shopping/ui's list, which never imports it (AD-24).
//
// The sheet waits for the answer before it closes, rather than switching
// optimistically like the pills: the action revalidates /lista in the same
// call (revalidateFor("pantry_site")), so once it answers the list is counted
// again, and "Lager: Stugan" never shows above a list counted against Hemma.
// The row being saved says so, and the other rows wait. A short confirmation
// then says "Listan räknas nu mot Stugan."; the list's own announcement of a
// recount stays silent for a switch of place (ShoppingList). A tap on the
// selected place only closes the sheet. A failure shows in a Notice in the
// sheet, which stays open; a place that is gone, or an answer that never
// came, reads the page again.

export type ListSiteLineProps = {
  /** The place the list was counted against (getShoppingList), or `null` when there is none or it could not be read. */
  site: SelectedSite | null;
  /** Every place of the user's, in the order they were created (listPantrySites), read in the same request. */
  sites: readonly PantrySite[];
};

const arrowSteps: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

/** "Lager: Stugan" and "Byt", and the sheet Byt ställe; nothing with one place. See the comment at the top. */
export function ListSiteLine({ site, sites }: ListSiteLineProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The place tapped last; it shows as being saved while `saving`. */
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const rows = useRef(new Map<string, HTMLButtonElement>());

  // A client navigation hides Inköpslista (Activity) instead of unmounting
  // it: the sheet closes then, so it is not open when Pontus comes back.
  useLayoutEffect(() => () => setSheetOpen(false), []);

  const line = siteLineText(site);
  if (line === null || site === null) return null;
  const selectedId = site.id;

  function open() {
    setError(null);
    setSheetOpen(true);
  }

  function choose(id: string) {
    if (saving) return;
    // The place the list is already counted against: nothing to save.
    if (id === selectedId) {
      setSheetOpen(false);
      return;
    }
    setError(null);
    setSavingId(id);
    startSaving(async () => {
      let result: Result<{ site: { id: string; name: string } }>;
      try {
        result = await selectPantrySite({ id });
      } catch {
        // No answer (e.g. no connection): it may have been saved, so the page is read again.
        result = fail("pantry_site_failed");
      }
      if (result.ok) {
        const { name } = result.data.site;
        // A transition, so React commits it with the list the action
        // revalidated (also a transition, while this one is pending): the
        // sheet closes as the recounted list shows.
        startTransition(() => {
          setSheetOpen(false);
          showToast(listCountedAgainstText(name));
        });
        return;
      }
      if (result.error.code !== "unauthorized") {
        const { message } = result.error;
        setError((before) => ({ text: message, id: (before?.id ?? 0) + 1 }));
      }
      // Gone, refused or unknown: what the server has is read again.
      router.refresh();
    });
  }

  /** The arrow keys move focus between the places; Space or Enter chooses one. */
  function onRowKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = arrowSteps[event.key];
    let target: number | null = step === undefined ? null : (index + step + sites.length) % sites.length;
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = sites.length - 1;
    if (target === null) return;
    event.preventDefault();
    const place = sites[target];
    if (place) rows.current.get(place.id)?.focus();
  }

  // Only the selected place is in the tab order, as in a radio group; another when it is gone.
  const tabbableId = sites.some((place) => place.id === selectedId) ? selectedId : sites[0]?.id;

  return (
    <>
      {/* Close under the title, as part of the header; metadata, never announced. */}
      <div className="-mt-4 mb-4 flex flex-wrap items-center gap-x-1">
        <p data-testid="site-line" className="min-w-0 text-meta break-words text-ink-2">
          {line}
        </p>
        {/* A tap before hydration would do nothing, so the button waits. */}
        <Button
          variant="text"
          aria-label={switchListButtonLabel}
          aria-haspopup="dialog"
          disabled={!hydrated}
          onClick={open}
        >
          {switchListButtonText}
        </Button>
      </div>
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={switchListTitle}
        closeLabel="Avbryt"
        preventClose={saving}
      >
        <div className="flex flex-col gap-4">
          {error ? (
            <Notice key={error.id} role="alert">
              {error.text}
            </Notice>
          ) : null}
          <div
            role="radiogroup"
            aria-label={switchListTitle}
            aria-busy={saving || undefined}
            className="flex flex-col rounded-lg bg-surface"
          >
            {sites.map((place, index) => {
              const checked = place.id === selectedId;
              const isSaving = saving && savingId === place.id;
              return (
                <button
                  key={place.id}
                  ref={(element) => {
                    if (element) rows.current.set(place.id, element);
                    else rows.current.delete(place.id);
                  }}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  // The row being saved keeps focus; the others wait.
                  aria-disabled={isSaving || undefined}
                  disabled={saving && !isSaving}
                  tabIndex={place.id === tabbableId ? 0 : -1}
                  data-testid="list-site-row"
                  onClick={() => choose(place.id)}
                  onKeyDown={(event) => onRowKeyDown(event, index)}
                  className="flex min-h-tap w-full items-center justify-between gap-3 border-t border-hairline px-4 py-2 text-left first:border-t-0 disabled:opacity-60"
                >
                  <span className="min-w-0 text-body break-words text-ink">{place.name}</span>
                  {isSaving ? (
                    <span className="shrink-0 text-meta text-ink-2">Sparar …</span>
                  ) : checked ? (
                    <CheckIcon size={20} className="shrink-0 text-accent" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </Sheet>
    </>
  );
}
