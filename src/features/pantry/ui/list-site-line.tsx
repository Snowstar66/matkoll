"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, type Result } from "@/lib/errors";
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

// The line "Boende: Hemma" and "Byt" in Inköpslista (FR-32, Story 8.5,
// EXPERIENCE.md, Flöde 6): with more than one place, under the page title,
// the place the list is counted against and the text button "Byt", which
// opens the sheet Byt boende ("Räkna listan mot"). A tap on a place there
// selects it with selectPantrySite, the same selection as the pills in Hemma
// (AD-24): the list has no place of its own, and the choice holds for the
// whole app until Pontus switches again. The page renders this beside
// shopping/ui's list, which never imports it (AD-24).
//
// The sheet waits for the answer before it closes, rather than switching
// optimistically like the pills: the action revalidates /lista in the same
// call (revalidateFor("pantry_site")), so once it answers the list is counted
// again, and "Boende: Stugan" never shows above a list counted against Hemma.
// The row being saved says so, and every row waits. A short confirmation then
// says "Listan räknas nu mot Stugan."; the page keeps the list's own
// announcement of a recount silent for a switch started here (onSwitching).
// A tap on the place shown as selected saves it too: the page may be stale
// after a switch on another device, and the selection is idempotent.
//
// A failure shows in a Notice in the sheet, which stays open, and the page is
// read again. An answer that never comes (lost, or none within
// selectTimeoutMs) reads the page again: if it then shows the place tapped,
// it was saved; otherwise the failure shows. While Inköpslista is hidden
// (Activity) the sheet is closed, so a failure then comes as a toast and a
// success says nothing. When the line goes (one place left, or no place),
// the sheet goes with it; focus moves to the page heading, and a place that
// was gone says so in a toast.

/** How long a selection may take before it counts as having no answer. */
export const selectTimeoutMs = 20_000;
/** How long the page may take to be read again after an answer that never came. */
export const refreshWaitMs = 10_000;

export type ListSiteLineProps = {
  /**
   * The place the list was counted against (getShoppingList), or `null` when
   * there is none or it could not be read: then the place selected in `sites`,
   * so the list can still be switched away from a place that cannot be read.
   */
  site: SelectedSite | null;
  /** Every place of the user's, in the order they were created (listPantrySites), read in the same request. */
  sites: readonly PantrySite[];
  /** Something on the list is being saved ("Lägg till i Matvaror", a check): "Byt" waits. */
  busy?: boolean;
  /**
   * Called with the place a switch from the sheet is on its way to, before
   * it is saved, and with `null` when it failed or the line went. The page
   * keeps the list's recount announcement silent for that place.
   */
  onSwitching?: (siteId: string | null) => void;
};

type Selected = Result<{ site: { id: string; name: string } }>;

/** selectPantrySite, or `lost` when it throws or gives no answer within selectTimeoutMs. */
async function answerOf(id: string): Promise<Selected | "lost"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"lost">((resolve) => {
    timer = setTimeout(() => resolve("lost"), selectTimeoutMs);
  });
  try {
    return await Promise.race([selectPantrySite({ id }).catch((): "lost" => "lost"), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Moves focus to the page heading that shows, never leaving it on <body>. */
function focusPageHeading() {
  // Pages hidden by Activity keep their headings, so the one that shows.
  const heading = [...document.querySelectorAll<HTMLElement>("h1")].find((element) =>
    typeof element.checkVisibility === "function" ? element.checkVisibility() : true,
  );
  if (!heading) return;
  if (!heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  heading.focus();
}

const failedText = errorMessages.pantry_site_failed;

/** "Boende: Stugan" and "Byt", and the sheet Byt boende; nothing with one place. See the comment at the top. */
export function ListSiteLine({ site, sites, busy = false, onSwitching }: ListSiteLineProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const { showToast } = useToast();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The place being saved, until its answer is handled. */
  const [savingId, setSavingId] = useState<string | null>(null);
  /** A place whose answer never came, and the places as they were when it was tapped: settled when they are read again. */
  const [uncertain, setUncertain] = useState<{ id: string; name: string; seen: readonly PantrySite[] } | null>(null);
  /** Set at once on a tap, so a second tap or Enter before the next render saves nothing. */
  const inFlight = useRef(false);
  /** Whether Inköpslista shows (not hidden by Activity). */
  const visible = useRef(false);
  /** The text of a pantry_site_gone in the sheet, for a toast if the line goes with it. */
  const goneText = useRef<string | null>(null);
  /** The row tapped last, for focus after a failure. */
  const tapped = useRef<string | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  /** The places the page was last read again for because the list and the places disagreed. */
  const refreshedFor = useRef<readonly PantrySite[] | null>(null);

  // A client navigation hides Inköpslista (Activity) instead of unmounting
  // it: the sheet closes then, so it is not open when Pontus comes back.
  useLayoutEffect(() => {
    visible.current = true;
    return () => {
      visible.current = false;
      setSheetOpen(false);
      setError(null);
    };
  }, []);

  // The line and the sheet show one place: the list's when there is one.
  const selectedInSites = sites.find((place) => place.isSelected) ?? null;
  const shown: SelectedSite | null = site
    ? { id: site.id, name: site.name, siteCount: sites.length }
    : selectedInSites && { id: selectedInSites.id, name: selectedInSites.name, siteCount: sites.length };
  const line = siteLineText(shown);
  const shownId = shown?.id ?? null;
  const disagree = site !== null && selectedInSites !== null && selectedInSites.id !== site.id;

  // The list and the places were read in one request and should agree; if
  // not, the page is read again, once for these places.
  useEffect(() => {
    if (!disagree || refreshedFor.current === sites) return;
    refreshedFor.current = sites;
    router.refresh();
  }, [disagree, sites, router]);

  // The line went (one place left, or none): the sheet and its notice go too,
  // and never come back by themselves (state adjusted while rendering).
  const lineShown = line !== null;
  const [hadLine, setHadLine] = useState(lineShown);
  if (hadLine !== lineShown) {
    setHadLine(lineShown);
    if (!lineShown) {
      setSheetOpen(false);
      setError(null);
      setSavingId(null);
      setUncertain(null);
    }
  }
  /** Whether the sheet showed at the last commit with the line, for focus when the line goes. */
  const sheetShowed = useRef(false);
  // The line went: a place that was gone says so, and focus goes to the page
  // heading rather than to <body>, since "Byt" went too. Runs before
  // sheetShowed is brought up to date below.
  useEffect(() => {
    if (lineShown) return;
    const gone = goneText.current;
    goneText.current = null;
    onSwitching?.(null);
    if (gone && visible.current) showToast(gone, { role: "alert" });
    if (sheetShowed.current) focusPageHeading();
    sheetShowed.current = false;
  }, [lineShown, onSwitching, showToast]);
  useEffect(() => {
    sheetShowed.current = sheetOpen && lineShown;
  });

  // An answer that never came is settled once the places are read again
  // (state adjusted while rendering): the place tapped shows, so it was
  // saved; or it does not, and the failure shows.
  const [confirmed, setConfirmed] = useState<{ text: string; id: number } | null>(null);
  if (uncertain && sites !== uncertain.seen) {
    setUncertain(null);
    if (shownId === uncertain.id) {
      setError(null);
      setSheetOpen(false);
      const name = sites.find((place) => place.id === uncertain.id)?.name ?? uncertain.name;
      setConfirmed((before) => ({ text: listCountedAgainstText(name), id: (before?.id ?? 0) + 1 }));
    } else {
      setError((before) => ({ text: failedText, id: (before?.id ?? 0) + 1 }));
    }
  }
  useEffect(() => {
    if (confirmed) showToast(confirmed.text);
  }, [confirmed, showToast]);
  // The places were not read again within refreshWaitMs: a failure, so the sheet is never locked.
  useEffect(() => {
    if (!uncertain) return;
    const timer = setTimeout(() => {
      setUncertain(null);
      setError((before) => ({ text: failedText, id: (before?.id ?? 0) + 1 }));
    }, refreshWaitMs);
    return () => clearTimeout(timer);
  }, [uncertain]);

  // After a failure the switch is off, and focus goes back to the row tapped
  // (it waited, disabled, while it was saved).
  useEffect(() => {
    if (!error) return;
    onSwitching?.(null);
    if (tapped.current) rows.current.get(tapped.current)?.focus();
  }, [error, onSwitching]);

  const saving = savingId !== null || uncertain !== null;

  if (line === null) return null;

  function open() {
    setError(null);
    goneText.current = null;
    setSheetOpen(true);
  }

  function choose(place: PantrySite) {
    if (inFlight.current || saving) return;
    inFlight.current = true;
    tapped.current = place.id;
    goneText.current = null;
    setError(null);
    setSavingId(place.id);
    // The list keeps quiet when it is counted against another place; already this one, nothing changes.
    const switching = place.id !== shownId;
    onSwitching?.(switching ? place.id : null);
    const seen = sites;
    startTransition(async () => {
      let answer: Selected | "lost";
      try {
        answer = await answerOf(place.id);
      } finally {
        inFlight.current = false;
      }
      if (answer !== "lost" && answer.ok) {
        const { name } = answer.data.site;
        const confirm = visible.current;
        // A transition, so React commits it with the list the action
        // revalidated (also a transition, while this one is pending): the
        // sheet closes as the recounted list shows.
        startTransition(() => {
          setSavingId(null);
          setSheetOpen(false);
          // Hidden meanwhile: no confirmation for a list on another page.
          if (confirm) showToast(listCountedAgainstText(name));
        });
        return;
      }
      setSavingId(null);
      if (answer === "lost") {
        if (visible.current) {
          // It may have been saved: the page is read again, and the places tell.
          setUncertain({ id: place.id, name: place.name, seen });
        } else {
          onSwitching?.(null);
          showToast(failedText, { role: "alert" });
        }
        router.refresh();
        return;
      }
      const { code, message } = answer.error;
      if (code === "unauthorized") {
        onSwitching?.(null);
        setSheetOpen(false);
      } else if (!visible.current) {
        onSwitching?.(null);
        showToast(message, { role: "alert" });
      } else {
        if (code === "pantry_site_gone") goneText.current = message;
        setError((before) => ({ text: message, id: (before?.id ?? 0) + 1 }));
      }
      // Gone, refused or the session ended: what the server has is read again.
      router.refresh();
    });
  }

  return (
    <>
      {/* A calm meta line under the week tiles: "Boende: Hemma · Byt"; metadata, never announced (Story 3.10). */}
      <div className="mb-2 flex flex-wrap items-center">
        <p data-testid="site-line" className="min-w-0 text-meta break-words text-ink-2">
          {line}
        </p>
        <span aria-hidden="true" className="px-1 text-meta text-ink-3">
          {"\u00B7"}
        </span>
        {/* A tap before hydration would do nothing, and a switch waits for what the list is saving. */}
        <Button
          variant="compact"
          className="-mx-1"
          aria-label={switchListButtonLabel}
          aria-haspopup="dialog"
          disabled={!hydrated || busy || saving}
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
          {/* A choice saves and closes the sheet, so the rows are buttons, not radios. */}
          <ul aria-label={switchListTitle} aria-busy={saving || undefined} className="flex flex-col rounded-lg bg-surface">
            {sites.map((place) => {
              const current = place.id === shownId;
              const isSaving = place.id === (savingId ?? uncertain?.id);
              return (
                <li key={place.id} className="border-t border-hairline first:border-t-0">
                  <button
                    ref={(element) => {
                      if (element) rows.current.set(place.id, element);
                      else rows.current.delete(place.id);
                    }}
                    type="button"
                    aria-current={current ? "true" : undefined}
                    disabled={saving}
                    data-testid="list-site-row"
                    onClick={() => choose(place)}
                    className="flex min-h-tap w-full items-center justify-between gap-3 px-4 py-2 text-left disabled:opacity-60"
                  >
                    <span className="min-w-0 text-body break-words text-ink">{place.name}</span>
                    {isSaving ? (
                      <span className="shrink-0 text-meta text-ink-2">Sparar …</span>
                    ) : current ? (
                      <CheckIcon size={20} className="shrink-0 text-accent" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </Sheet>
    </>
  );
}
