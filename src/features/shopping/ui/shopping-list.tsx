"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, type RefObject, useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/button";
import { CheckCircle } from "@/components/check-circle";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { FixedAction } from "@/components/fixed-action";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { SwipeRow } from "@/components/swipe-row";
import { type SelectedSite, shownSiteName } from "@/features/pantry";
import type { Store } from "@/features/settings";
import { useToast } from "@/components/toast";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { setChecked } from "../actions/set-checked";
import type { CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";
import { exportableLines } from "../domain/export-basket";
import {
  allInStockText,
  checkLabel,
  emptyPlanText,
  groupBySection,
  itemsLeft,
  lineAmountText,
  listSummaryText,
  originsText,
  pantryUnreadText,
  checksUnreadText,
  hiddenLinesButtonText,
  recountedText,
  sendButtonText,
  siteRecountedText,
  skippedDishesText,
} from "../domain/list-text";
import { CustomItemSheet } from "./custom-item-sheet";
import { HiddenLinesSheet } from "./hidden-lines-sheet";
import { LineDetailSheet } from "./line-detail-sheet";
import { useLineRemoval } from "./line-removal";
import { useOwnChanges } from "./own-changes";
import { openSettingsText, type ProductChoice, type ProductChoiceContext } from "../domain/product-choice";
import { ProductChoiceSheet } from "./product-choice-sheet";
import { canPutInPantry } from "../domain/put-in-pantry";
import { PutInPantryButton, usePutInPantry } from "./put-in-pantry";
import { ExportSheet, useSendBasket } from "./send-basket";

// Inköpslista (FR-15, UX-DR9): the current plan's name, number of dishes and
// items left under the title, then the lines per store section in the fixed
// order, each with its check, its name, "från [rätt]" and the amount to the
// right ("2 dl (hemma: 1 kg)", "Finns hemma?"). The list is counted on the
// server every time it is read; when it changes while it is open, a live
// region says so. A check shows at once and is saved with setChecked (FR-16);
// a checked line stays in its place, struck through. "Lägg till egen vara"
// under the list adds Pontus's own item (FR-17). A tap on a line's name opens
// Listpostdetalj (Story 3.6), where Pontus corrects a recipe line's amount or
// changes an own item; a swipe to the left removes a line (an own item) or
// hides it (a recipe line), with "Ångra" in the short confirmation. "Dolda
// varor (N)" under the list shows the hidden lines, with "Visa igen". While
// a line is checked off, "Lägg i lagret" above the tab bar puts every checked
// line in the pantry and takes it off the list (Story 3.7). The detail of a
// line with a catalog ingredient shows the selected store's product choice
// for it, and its button replaces the detail with the sheet Produktval
// (Story 7.2); the choices sit beside the list and never change its count.
// "Skicka till ICA" (named after the store's chain) is pinned above the tab
// bar while there is something to send, under "Lägg i lagret" when that
// shows; it copies the basket export of the lines as shown (Story 7.3).

export type ShoppingListProps = {
  /**
   * The current plan, or `null` when there is none. `dishCount` is the dishes
   * the list is counted from; `skippedCount` those left out because their
   * recipe is deleted.
   */
  plan: {
    /** The plan the list is counted for; checks are saved on it. */
    id: string;
    name: string;
    dishCount: number;
    skippedCount: number;
    dishTitles: Readonly<Record<string, string>>;
  } | null;
  /** computeList's lines, sorted by section and name. */
  lines: readonly ShoppingLine[];
  /** The lines Pontus has hidden, as counted without being hidden (Dolda varor, Story 3.6). */
  hiddenLines?: readonly ShoppingLine[];
  /** The pantry could not be read, so nothing is taken off. */
  pantryUnavailable: boolean;
  /** The checks could not be read: no line is shown checked, and checking is off. */
  checksUnavailable?: boolean;
  /**
   * Checks of lines no longer on the list that an interrupted "Lägg i
   * lagret" put in the pantry (Story 3.7): the button shows to clear them.
   */
  pendingClear?: number;
  /**
   * Searches the catalog for the suggestions in Lägg till egen vara
   * (catalog.searchIngredients, passed down from the page, AD-1). Without
   * it, the sheet suggests nothing.
   */
  searchIngredients?: SearchIngredients;
  /** The selected store (Story 7.2), as the list was read; `null` when none is selected. */
  store?: Store | null;
  /** The store could not be read: the detail's section Produktval says so. */
  storeUnavailable?: boolean;
  /** The store's product choices by catalog ingredient id. */
  productChoices?: Readonly<Record<string, ProductChoice>>;
  /**
   * The place the list is counted against (getShoppingList, AD-24); "Lägg i
   * lagret" puts the items there. `null` when there is none or it could not
   * be read: then the place selected when Pontus taps. Data for the list's
   * texts too (Story 8.5): the empty list names it with more than one place,
   * and a list counted against another place says so. The line "Lager:
   * Stugan" and "Byt" are the page's (pantry/ui ListSiteLine, AD-24).
   */
  site?: SelectedSite | null;
  /**
   * Whether a list now counted against `siteId` comes from a switch made in
   * the list's own sheet (the page has it from ListSiteLine): then it is not
   * announced, since the switch's confirmation says so. Asked once, when the
   * place changes; asking settles it. Without it, every switch is announced.
   */
  isQuietSwitch?: (siteId: string | null) => boolean;
  /**
   * Told whether the list is saving something ("Lägg i lagret", or a check
   * on its way), so the page can let "Byt" wait.
   */
  onBusyChange?: (busy: boolean) => void;
  /** The choices could not be read: the detail's section Produktval says so. */
  productChoicesUnavailable?: boolean;
  /** The catalog ingredients whose stored choice cannot be read: their section says so. */
  unreadableChoices?: readonly string[];
};

/** How long an announcement stays in the live region before it is cleared. */
export const announcementMs = 5000;

/**
 * Everything a line shows, so any visible change counts as a recount; except
 * what Pontus does: its check, which the check itself reads out, their
 * own items, which they add, change and remove, and the lines they are
 * removing, putting back, correcting or showing again (`touched`, by
 * `${planId} ${key}`, until the server's list shows the change).
 */
function signatureOf(lines: readonly ShoppingLine[], planId: string | null, touched: ReadonlySet<string>): string {
  return JSON.stringify(
    lines.filter((line) => !line.isCustom && !touched.has(`${planId} ${line.key}`)).map((line) => [
      line.key,
      line.label,
      line.amount,
      line.computedAmount ?? null,
      line.computedChanged ?? false,
      line.unit,
      line.pantryNote ?? null,
      line.isVague,
      line.origins,
      line.multiplier ?? null,
    ]),
  );
}

/**
 * Announces "Inköpslistan är omräknad. N varor kvar." when the lines change
 * while the list is shown, and clears the text again after announcementMs and
 * when the list is hidden. The list as it is when it is shown (on first load,
 * or when Pontus comes back to the tab, since Next keeps the page mounted but
 * hidden) is never announced.
 *
 * A list counted against another place than the one shown last (Story 8.5)
 * says "Listan räknas nu mot Hemma. N varor kvar." (with more than one
 * place; else the recount text when the lines changed), unless the switch
 * was made from the list's own sheet (`isQuietSwitch`): its confirmation
 * ("Listan räknas nu mot Stugan.") says so, and a screen reader hears one
 * text, not two. That silence holds for the one render where the place
 * changes; the next recount on the new place is announced as before.
 */
function useRecountAnnouncement(
  lines: readonly ShoppingLine[],
  planId: string | null,
  touched: ReadonlySet<string>,
  site: SelectedSite | null,
  isQuietSwitch: ((siteId: string | null) => boolean) | undefined,
): { text: string; count: number } {
  const siteId = site?.id ?? null;
  const siteName = shownSiteName(site);
  const latest = useRef({ lines, touched, siteId });
  /**
   * The lines last shown, the lines touched then and the place they were
   * counted against; `null` while the page is hidden. A line touched then or
   * now is left out of both sides, so a line that stops being touched is
   * never announced.
   */
  const shown = useRef<{ lines: readonly ShoppingLine[]; touched: ReadonlySet<string>; siteId: string | null } | null>(
    null,
  );
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const left = itemsLeft(lines);

  useEffect(() => {
    latest.current = { lines, touched, siteId };
  });

  // Runs when the list is shown, and its cleanup when it is hidden.
  useEffect(() => {
    shown.current = latest.current;
    return () => {
      shown.current = null;
      setAnnouncement((before) => (before.text ? { ...before, text: "" } : before));
    };
  }, []);

  useEffect(() => {
    const before = shown.current;
    if (before === null) return;
    const either = new Set([...before.touched, ...touched]);
    const recounted = signatureOf(before.lines, planId, either) !== signatureOf(lines, planId, either);
    let text: string | null = null;
    if (before.siteId !== siteId) {
      // Another place: said by the sheet's confirmation when the switch was made there.
      if (!isQuietSwitch?.(siteId)) {
        if (siteName !== null) text = siteRecountedText(siteName, left);
        else if (recounted) text = recountedText(left);
      }
    } else if (recounted) {
      text = recountedText(left);
    }
    if (text !== null) {
      const said = text;
      // A new count each time, so the same text is announced again.
      setAnnouncement((previous) => ({ text: said, count: previous.count + 1 }));
    }
    shown.current = { lines, touched, siteId };
  }, [lines, left, planId, touched, siteId, siteName, isQuietSwitch]);

  useEffect(() => {
    if (!announcement.text) return;
    const { count } = announcement;
    const timer = setTimeout(
      () => setAnnouncement((before) => (before.count === count ? { ...before, text: "" } : before)),
      announcementMs,
    );
    return () => clearTimeout(timer);
  }, [announcement]);

  return announcement;
}

/** How long a check waits for the server before it counts as not saved. */
export const checkTimeoutMs = 15_000;

/** What a write of a check came back with; `lost` when there was no answer in time, or none at all. */
type Answer = { result: Result<CheckChange>; lost: boolean };

/** setChecked, or a failure when it throws or gives no answer within checkTimeoutMs. */
async function answerOf(change: CheckChange): Promise<Answer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Answer>((resolve) => {
    timer = setTimeout(() => resolve({ result: fail("shopping_check_failed"), lost: true }), checkTimeoutMs);
  });
  try {
    return await Promise.race([
      setChecked(change).then(
        (result): Answer => ({ result, lost: false }),
        (): Answer => ({ result: fail("shopping_check_failed"), lost: true }),
      ),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** A line's check writes during a burst of taps. */
type CheckWrites = {
  /** The latest state tapped. */
  wanted: boolean;
  /** The state the burst last sent, or `null` before the first write. */
  sent: boolean | null;
  /** The answer to that write. */
  last: Answer | null;
  /** Writes queued and not yet done. */
  pending: number;
  /** The last queued write; the next waits for it. */
  chain: Promise<void>;
};

/** A failed check's notice; a new `id` per failure, so the same text is announced again. */
type CheckNotice = { text: string; id: number; key: string };

/** A line's check on a plan; the optimistic state, the taps and the writes are kept per plan. */
const checkId = (planId: string, key: string) => `${planId} ${key}`;

/**
 * The checks as shown, by checkId: the server's, with the taps not yet saved
 * on top (useOptimistic). `toggle` saves a line's check with setChecked, one
 * write at a time per line, so a quick series of taps ends with the last
 * state saved. A failure, or no answer within checkTimeoutMs, puts the check
 * back and gives `notice`, which goes when the same line is saved later or
 * the list is hidden; `shopping_plan_changed` and a lost answer also read
 * the list again. An answer for a plan the list no longer shows is ignored.
 */
function useChecks(planId: string | null, lines: readonly ShoppingLine[]) {
  const router = useRouter();
  const saved = useMemo(
    () => (planId === null ? {} : Object.fromEntries(lines.map((line) => [checkId(planId, line.key), line.checked]))),
    [planId, lines],
  );
  const [checks, showCheck] = useOptimistic(saved, (state: Record<string, boolean>, change: { id: string; checked: boolean }) => ({
    ...state,
    [change.id]: change.checked,
  }));
  const [, startTransition] = useTransition();
  /** The number of the latest tap per checkId, so only its failure is reported. */
  const latestTap = useRef(new Map<string, number>());
  /** Per checkId, the writes of a burst of taps, one at a time; see save. */
  const writes = useRef(new Map<string, CheckWrites>());
  /** The plan the list shows now, for code that runs after an await. */
  const shownPlan = useRef(planId);
  useEffect(() => {
    shownPlan.current = planId;
  }, [planId]);
  const [notice, setNotice] = useState<CheckNotice | null>(null);
  /** Taps whose save has not answered yet; "Lägg i lagret" waits for them, so the server sees the checks shown. */
  const [saving, setSaving] = useState(0);
  const nextNotice = useRef(0);

  // The notice belongs to what Pontus just did: it goes when the list is hidden.
  useEffect(() => () => setNotice(null), []);

  /**
   * Saves the line's latest state after any write of it already on its way.
   * A write whose state an earlier write of the same burst already saved is
   * skipped. Resolves with the answer to the write that saved (or tried) the
   * latest state.
   */
  function save(change: CheckChange): Promise<Answer> {
    const id = checkId(change.planId, change.key);
    let write = writes.current.get(id);
    if (!write) {
      write = { wanted: change.checked, sent: null, last: null, pending: 0, chain: Promise.resolve() };
      writes.current.set(id, write);
    }
    const current = write;
    current.wanted = change.checked;
    current.pending += 1;
    const link = current.chain.then(async () => {
      try {
        if (current.sent === current.wanted && current.last?.result.ok) return;
        const checked = current.wanted;
        current.last = await answerOf({ ...change, checked });
        current.sent = checked;
      } finally {
        current.pending -= 1;
        // The burst is over: the next tap starts a new one, which always writes.
        if (current.pending === 0) writes.current.delete(id);
      }
    });
    current.chain = link;
    return link.then(() => current.last ?? { result: fail("shopping_check_failed"), lost: false });
  }

  function toggle(key: string, checked: boolean) {
    if (planId === null) return;
    const id = checkId(planId, key);
    const tap = (latestTap.current.get(id) ?? 0) + 1;
    latestTap.current.set(id, tap);
    setSaving((count) => count + 1);
    startTransition(async () => {
      showCheck({ id, checked });
      const { result, lost } = await save({ planId, key, checked });
      setSaving((count) => count - 1);
      if (latestTap.current.get(id) !== tap || shownPlan.current !== planId) return;
      if (result.ok) {
        setNotice((before) => (before?.key === key ? null : before));
        return;
      }
      if (result.error.code === "unauthorized") {
        router.refresh();
        return;
      }
      nextNotice.current += 1;
      setNotice({ text: result.error.message, id: nextNotice.current, key });
      if (lost || result.error.code === "shopping_plan_changed") router.refresh();
    });
  }

  return { checks, toggle, notice, saving: saving > 0 };
}

/** No hidden lines: for a list rendered without them. */
const noLines: readonly ShoppingLine[] = [];

/** No suggestions: for a list rendered without the catalog's search. */
const noSuggestions: SearchIngredients = async () => ok([]);

/** No product choices: for a list rendered without them. */
const noChoices: Readonly<Record<string, ProductChoice>> = {};
const noUnreadable: readonly string[] = [];

/** When the sheet Produktval closes by itself: the store it was opened for is no longer the one the list shows. */
export const storeChangedText = "Butiken har bytts. Öppna produktvalet igen.";

/** The sheet Produktval: the line and store it opened with, kept while it closes. */
type ChoiceSheet = {
  open: boolean;
  session: number;
  label: string;
  ingredientId: string;
  store: Store;
};

/**
 * Focus after a line was removed with the keyboard or from its detail: the
 * next line's check, else the one before; when that check is disabled (the
 * checks could not be read), the line's "Ta bort"; else "Lägg till egen vara".
 */
function useFocusAfterRemoval(
  rootRef: RefObject<HTMLDivElement | null>,
  focusAfterRef: RefObject<string | null>,
  order: readonly string[],
) {
  const lastOrder = useRef<readonly string[]>(order);
  useEffect(() => {
    const removed = focusAfterRef.current;
    if (removed !== null && !order.includes(removed)) {
      const before = lastOrder.current;
      const index = before.indexOf(removed);
      const neighbours = index === -1 ? [] : [...before.slice(index + 1), ...before.slice(0, index).reverse()];
      const target = neighbours.find((key) => order.includes(key));
      const row = target
        ? [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-line-key]") ?? [])].find(
            (element) => element.dataset.lineKey === target,
          )
        : undefined;
      // The row's check; when checking is off, the row's "Ta bort" (its last button); else "Lägg till egen vara".
      const element =
        row?.querySelector<HTMLElement>("[role=checkbox]:not([disabled])") ??
        [...(row?.querySelectorAll<HTMLElement>("button:not([role=checkbox]):not([disabled])") ?? [])].at(-1) ??
        rootRef.current?.querySelector<HTMLElement>("[data-add-custom-item]");
      element?.focus();
      focusAfterRef.current = null;
    }
    lastOrder.current = order;
  });
}

export function ShoppingList({
  plan,
  lines: savedLines,
  hiddenLines = noLines,
  pantryUnavailable,
  checksUnavailable = false,
  pendingClear = 0,
  searchIngredients = noSuggestions,
  store = null,
  storeUnavailable = false,
  productChoices = noChoices,
  productChoicesUnavailable = false,
  unreadableChoices = noUnreadable,
  site = null,
  isQuietSwitch,
  onBusyChange,
}: ShoppingListProps) {
  const planId = plan?.id ?? null;
  const { checks, toggle, notice, saving } = useChecks(planId, savedLines);
  const removal = useLineRemoval(planId, savedLines);
  const lines = useMemo(
    () =>
      removal.shown.map((line) => {
        const checked = planId === null ? line.checked : (checks[checkId(planId, line.key)] ?? line.checked);
        return checked === line.checked ? line : { ...line, checked };
      }),
    [planId, removal.shown, checks],
  );
  const own = useOwnChanges(savedLines);
  const pantry = usePutInPantry(planId, site?.id ?? null, savedLines, own);
  // The lines "Lägg i lagret" acts on, as shown (a tap shows before it is saved); a checked text line is not one.
  const toPantry = lines.flatMap((line) => (canPutInPantry(line) ? [line.key] : []));
  // The sets are new each render; one set per content, so the announcement's effect runs only on a change.
  const touchedIds = [...new Set([...removal.touched, ...own.touched])].sort().join("\n");
  const touched = useMemo(() => new Set(touchedIds ? touchedIds.split("\n") : []), [touchedIds]);
  const announcement = useRecountAnnouncement(lines, planId, touched, site, isQuietSwitch);
  // "Lägg i lagret", or a check on its way: the page lets "Byt" wait, so the list is not switched under it.
  const busy = pantry.pending || saving;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const hasDishes = plan !== null && plan.dishCount > 0;
  const hasLines = lines.length > 0;
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusAfterRemoval(
    rootRef,
    removal.focusAfterRef,
    lines.map((line) => line.key),
  );
  const [sheet, setSheet] = useState({ open: false, session: 0 });
  /** Listpostdetalj: the line as it was when its name was tapped, on the plan it was shown for. */
  const [detail, setDetail] = useState<{ open: boolean; session: number; line: ShoppingLine; planId: string } | null>(null);
  const openDetail = (line: ShoppingLine) => {
    if (planId === null) return;
    setDetail((current) => ({ open: true, session: (current?.session ?? 0) + 1, line, planId }));
  };
  // The line is gone from the list while its detail is open (counted again elsewhere): the detail closes.
  if (detail?.open && !lines.some((line) => line.key === detail.line.key)) {
    setDetail({ ...detail, open: false });
  }
  const choiceContext = useMemo<ProductChoiceContext>(
    () => ({ store, storeUnavailable, productChoices, productChoicesUnavailable, unreadableChoices }),
    [store, storeUnavailable, productChoices, productChoicesUnavailable, unreadableChoices],
  );
  const [choiceSheet, setChoiceSheet] = useState<ChoiceSheet | null>(null);
  const { showToast } = useToast();
  // The list is read again while the sheet Produktval is open, and the
  // store it was opened for is no longer the selected one, or the choices
  // cannot be read now: the sheet closes and says why, rather than save
  // against a store or choice it cannot show.
  const sheetStoreId = choiceSheet?.open ? choiceSheet.store.id : null;
  const sheetStale = sheetStoreId !== null && (storeUnavailable || productChoicesUnavailable || store?.id !== sheetStoreId);
  /** Why the sheet closed by itself; a new id each time, so the same text is shown again. */
  const [staleNotice, setStaleNotice] = useState<{ text: string; id: number } | null>(null);
  if (sheetStale && choiceSheet) {
    // State adjusted while rendering: the sheet closes, and the toast follows in an effect.
    setChoiceSheet({ ...choiceSheet, open: false });
    const text = storeUnavailable || productChoicesUnavailable ? errorMessages.shopping_product_choices_unavailable : storeChangedText;
    setStaleNotice((before) => ({ text, id: (before?.id ?? 0) + 1 }));
  }
  useEffect(() => {
    if (staleNotice) showToast(staleNotice.text, { role: "alert" });
  }, [staleNotice, showToast]);
  /**
   * "Ange produktval" / "Ändra produktval" in the detail: the sheet
   * Produktval opens for the line's catalog ingredient, with the store and
   * choice as the list was read. The detail is not closed here: the sheet
   * replaces it, and asks "Släng ändringarna?" first when the detail has
   * changes (Sheet); "Fortsätt ändra" keeps the detail and closes this one.
   */
  const openProductChoice = (line: ShoppingLine) => {
    if (!store || !line.ingredientId || unreadableChoices.includes(line.ingredientId)) return;
    const { ingredientId } = line;
    setChoiceSheet((current) => ({
      open: true,
      session: (current?.session ?? 0) + 1,
      label: line.label,
      ingredientId,
      store,
    }));
  };
  // "Skicka till ICA": the export is built from the lines as shown, a check not yet saved included.
  const basket = useSendBasket({
    lines,
    store,
    storeUnavailable,
    productChoices,
    productChoicesUnavailable,
    unreadableChoices,
    checksUnavailable,
  });
  const canSend = plan !== null && exportableLines(lines).length > 0;
  const [hiddenSheet, setHiddenSheet] = useState(false);
  // Nothing hidden any more: the sheet closes.
  if (hiddenSheet && hiddenLines.length === 0) setHiddenSheet(false);

  return (
    <div ref={rootRef} className="flex flex-col gap-6">
      {/* Mounted empty, so a recount is announced when its text arrives. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="list-announcement">
        {announcement.text ? <span key={announcement.count}>{announcement.text}</span> : null}
      </div>
      {hasDishes || (plan && (hasLines || plan.skippedCount > 0)) ? (
        // Close under the title, as part of the header.
        <div className="-mt-4 flex flex-col gap-1">
          {hasDishes || hasLines ? (
            <p data-testid="list-summary" className="text-meta text-ink-2">
              {listSummaryText(plan.name, plan.dishCount, itemsLeft(lines))}
            </p>
          ) : null}
          {plan.skippedCount > 0 ? (
            <p data-testid="list-skipped" className="text-meta text-ink-2">
              {skippedDishesText(plan.skippedCount)}
            </p>
          ) : null}
        </div>
      ) : null}
      {/* Nothing is taken off, but the list is still there: a status, not an alert. */}
      {hasDishes && pantryUnavailable ? <Notice role="status">{pantryUnreadText}</Notice> : null}
      {(hasDishes || hasLines) && checksUnavailable ? <Notice role="status">{checksUnreadText}</Notice> : null}
      {/* A check that was not saved, or a plan switched elsewhere; a new element per failure, so it is announced again. */}
      {notice ? (
        <Notice key={notice.id} role="alert">
          {notice.text}
        </Notice>
      ) : null}
      {/* "Lägg i lagret" that failed; trying again adds nothing twice. */}
      {pantry.notice ? (
        <Notice key={`pantry-${pantry.notice.id}`} role="alert">
          {pantry.notice.text}
        </Notice>
      ) : null}
      {/* "Skicka till ICA" without a store that can be read: nothing was copied. */}
      {basket.storeNotice !== null ? (
        <Notice
          key={`store-${basket.storeNotice}`}
          role="alert"
          action={
            <Link href="/installningar" className={buttonClasses("text")}>
              {openSettingsText}
            </Link>
          }
        >
          {errorMessages.shopping_export_store_missing}
        </Notice>
      ) : null}
      {plan === null ? (
        <EmptyState>{emptyPlanText}</EmptyState>
      ) : (
        <>
          {!hasLines ? (
            // "Allt finns hemma." (or "… i lagret för Stugan.") only when the list has no lines at all, own items included.
            <EmptyState>{hasDishes ? allInStockText(shownSiteName(site)) : emptyPlanText}</EmptyState>
          ) : (
            groupBySection(lines).map(({ section, lines: sectionLines }) => (
              <ListSection
                key={section}
                section={section}
                lines={sectionLines}
                dishTitles={plan.dishTitles}
                onCheckedChange={toggle}
                onRemove={removal.remove}
                onOpen={openDetail}
                checkingOff={checksUnavailable}
              />
            ))
          )}
          {/* Own items belong to the current plan: without one there is nothing to add them to (AD-22). */}
          <Button
            variant="secondary"
            fullWidth
            data-add-custom-item
            onClick={() => setSheet((current) => ({ open: true, session: current.session + 1 }))}
          >
            Lägg till egen vara
          </Button>
          {hiddenLines.length > 0 ? (
            <Button variant="text" fullWidth aria-haspopup="dialog" onClick={() => setHiddenSheet(true)}>
              {hiddenLinesButtonText(hiddenLines.length)}
            </Button>
          ) : null}
          <HiddenLinesSheet
            open={hiddenSheet}
            planId={plan.id}
            lines={hiddenLines}
            onShow={own.track}
            onClose={() => setHiddenSheet(false)}
          />
          <CustomItemSheet
            open={sheet.open}
            session={sheet.session}
            planId={plan.id}
            searchIngredients={searchIngredients}
            onClose={() => setSheet((current) => ({ ...current, open: false }))}
          />
          <ListActions
            putInPantry={
              // Shown while a line is checked off (as shown, before the check is saved), and while the flow runs.
              // Also for checks an interrupted run left behind (pendingClear), so the retry stays reachable.
              !checksUnavailable && (toPantry.length > 0 || pendingClear > 0 || pantry.pending) ? (
                <PutInPantryButton
                  disabled={pantry.pending || saving}
                  busy={pantry.pending}
                  onPut={() => void pantry.put(toPantry)}
                />
              ) : null
            }
            // Off while a check is being saved: a check that goes back must not leave an item out.
            send={canSend ? { text: sendButtonText(store), onSend: basket.send, disabled: saving } : null}
          />
          {/* Mounted from the first refused copy, and kept, so it can close with its animation. */}
          {basket.sheet ? (
            <ExportSheet state={basket.sheet} onCopy={basket.copyAgain} onClose={basket.closeSheet} />
          ) : null}
          {/* Mounted from the first tap on a name, and kept, so it can close with its animation. */}
          {detail ? (
            <LineDetailSheet
              open={detail.open && detail.planId === plan.id}
              session={detail.session}
              planId={detail.planId}
              line={detail.line}
              dishTitles={plan.dishTitles}
              searchIngredients={searchIngredients}
              onRemove={removal.remove}
              onChange={own.track}
              productChoices={choiceContext}
              onProductChoice={openProductChoice}
              onClose={() => setDetail((current) => (current ? { ...current, open: false } : current))}
            />
          ) : null}
          {/* Mounted from the first "Ange produktval", and kept, so it can close with its animation. */}
          {choiceSheet ? (
            <ProductChoiceSheet
              open={choiceSheet.open}
              session={choiceSheet.session}
              label={choiceSheet.label}
              ingredientId={choiceSheet.ingredientId}
              store={choiceSheet.store}
              // The choice as the list has it now, so a refused save can take it up.
              choice={sheetStale ? null : (productChoices[choiceSheet.ingredientId] ?? null)}
              onClose={() => setChoiceSheet((current) => (current ? { ...current, open: false } : current))}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The list's Fast åtgärdsknapp (UX-DR3): one FixedAction with "Lägg i
 * lagret" (primary) on top when it shows, and "Skicka till ICA" under it,
 * secondary then and primary alone; one primary button per view. Nothing
 * when neither shows.
 */
function ListActions({
  putInPantry,
  send,
}: {
  putInPantry: ReactNode;
  /** The button's text, what a tap does and whether it is off; `null` when there is nothing to send. */
  send: { text: string; onSend: () => void; disabled: boolean } | null;
}) {
  if (!putInPantry && !send) return null;
  return (
    <FixedAction>
      {putInPantry}
      {send ? (
        <Button variant={putInPantry ? "secondary" : "primary"} fullWidth disabled={send.disabled} onClick={send.onSend}>
          {send.text}
        </Button>
      ) : null}
    </FixedAction>
  );
}

function ListSection({
  section,
  lines,
  dishTitles,
  onCheckedChange,
  onRemove,
  onOpen,
  checkingOff,
}: {
  section: string;
  lines: readonly ShoppingLine[];
  dishTitles: Readonly<Record<string, string>>;
  onCheckedChange: (key: string, checked: boolean) => void;
  /** Removes an own item or hides a recipe line; `moveFocus` when it came from the keyboard. */
  onRemove: (line: ShoppingLine, moveFocus: boolean) => void;
  /** Opens the line's Listpostdetalj. */
  onOpen: (line: ShoppingLine) => void;
  /** Checking is off: the saved checks could not be read. */
  checkingOff: boolean;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-section-label text-ink-2">
        {section}
      </h2>
      <ul aria-labelledby={headingId} className="flex flex-col overflow-hidden rounded-lg bg-surface">
        {lines.map((line) => (
          <ShoppingLineRow
            key={line.key}
            line={line}
            dishTitles={dishTitles}
            onCheckedChange={(checked) => onCheckedChange(line.key, checked)}
            onRemove={(moveFocus) => onRemove(line, moveFocus)}
            onOpen={() => onOpen(line)}
            checkingOff={checkingOff}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * One listpost: the check (CheckCircle, 44 × 44 px) to the left, the name
 * with "från [rätt]" under it, and the amount to the right. Checked, the
 * check is filled with accent and the text is struck through in ink-3; the
 * line stays in its place. The check and the name are separate tap targets:
 * with `onOpen`, the name (with "från [rätt]") is a button that opens
 * Listpostdetalj. With `onRemove`, swiping the row to the left reveals "Ta
 * bort" (SwipeRow), also reached with Tab after the row.
 */
export function ShoppingLineRow({
  line,
  dishTitles,
  onCheckedChange,
  onRemove,
  onOpen,
  checkingOff = false,
}: {
  line: ShoppingLine;
  dishTitles: Readonly<Record<string, string>>;
  onCheckedChange: (checked: boolean) => void;
  /** Removes or hides the line; `moveFocus` when it came from the keyboard. */
  onRemove?: (moveFocus: boolean) => void;
  /** Opens the line's Listpostdetalj. */
  onOpen?: () => void;
  /** Checking is off: the saved checks could not be read. */
  checkingOff?: boolean;
}) {
  const row = (
    // The divider is inset like the card's padding, and moves with the row.
    <div className="px-4">
      <div className="flex min-h-tap items-center gap-3 border-t border-hairline py-2 group-first:border-t-0">
        <LineContent
          line={line}
          dishTitles={dishTitles}
          onCheckedChange={onCheckedChange}
          onOpen={onOpen}
          checkingOff={checkingOff}
        />
      </div>
    </div>
  );
  return (
    <li data-testid="shopping-line" data-line-key={line.key} data-checked={line.checked} className="group">
      {onRemove ? (
        <SwipeRow actionLabel="Ta bort" actionName={`Ta bort ${line.label}`} onAction={(via) => onRemove(via === "keyboard")}>
          {row}
        </SwipeRow>
      ) : (
        row
      )}
    </li>
  );
}

function LineContent({
  line,
  dishTitles,
  onCheckedChange,
  onOpen,
  checkingOff,
}: {
  line: ShoppingLine;
  dishTitles: Readonly<Record<string, string>>;
  onCheckedChange: (checked: boolean) => void;
  onOpen?: () => void;
  checkingOff: boolean;
}): ReactNode {
  const from = originsText(line.origins, dishTitles);
  const amount = lineAmountText(line);
  const { checked } = line;
  const name = (
    <>
      <span className={cx("text-body", checked ? "text-ink-3 line-through" : "text-ink")}>{line.label}</span>
      {from ? <span className={cx("text-meta", checked ? "text-ink-3" : "text-ink-2")}> {from}</span> : null}
    </>
  );
  return (
    <>
      {/* The visible circle lines up with the list's padding; the tap area reaches into it. */}
      <CheckCircle
        checked={checked}
        onCheckedChange={onCheckedChange}
        label={checkLabel(line)}
        disabled={checkingOff}
        className="-ml-[9px]"
      />
      {/* The spaces keep the words apart for screen readers. */}
      {onOpen ? (
        <button
          type="button"
          aria-haspopup="dialog"
          data-testid="shopping-line-name"
          onClick={onOpen}
          className="flex min-h-tap min-w-0 flex-1 flex-col justify-center rounded-sm text-left"
        >
          {name}
        </button>
      ) : (
        <span className="flex min-w-0 flex-1 flex-col">{name}</span>
      )}
      {amount ? (
        <span className={cx("shrink-0 text-right text-body", checked ? "text-ink-3 line-through" : "text-ink-2")}>
          {" "}
          {amount}
        </span>
      ) : null}
    </>
  );
}
