"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, type RefObject, useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/button";
import { CategoryHeader } from "@/components/category-header";
import { Checkbox } from "@/components/checkbox";
import { useConfirmDelete } from "@/components/confirm-delete";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import { FixedAction } from "@/components/fixed-action";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Meter } from "@/components/meter";
import { Notice } from "@/components/notice";
import { SwipeRow } from "@/components/swipe-row";
import { TrashButton, type TrashPress } from "@/components/trash-button";
import type { Category } from "@/features/catalog";
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
  backOnListAnnouncement,
  basketText,
  basketToggleText,
  checkLabel,
  missingText,
  emptyPlanText,
  groupByCategory,
  inBasketAnnouncement,
  itemsLeft,
  lineAmountText,
  lineMetaText,
  lineName,
  listSummaryText,
  pantryUnreadText,
  checksUnreadText,
  hiddenLinesButtonText,
  progressText,
  recountedText,
  sendButtonText,
  shareButtonText,
  stepsLinkText,
  siteRecountedText,
  skippedDishesText,
} from "../domain/list-text";
import { CustomItemSheet } from "./custom-item-sheet";
import { HiddenLinesSheet } from "./hidden-lines-sheet";
import { LineDetailSheet } from "./line-detail-sheet";
import { useLineRemoval } from "./line-removal";
import { useOwnChanges } from "./own-changes";
import { openSettingsText, type ProductChoice, type ProductChoiceContext } from "../domain/product-choice";
import { chipChoice, ProductChip } from "./product-chip";
import { ProductChoiceSheet } from "./product-choice-sheet";
import { canPutInPantry } from "../domain/put-in-pantry";
import { PutInPantryButton, usePutInPantry } from "./put-in-pantry";
import { ExportSheet, useSendBasket } from "./send-basket";
import { StepsSheet } from "./steps-sheet";

// Inköpslista (FR-15, UX-DR9; the new look of Story 11.4, FR-43): the current
// plan's name and number of dishes under the title, then the progress row
// ("8 varor kvar", "6 av 14 i korgen" and a meter), then the lines not
// checked off per display category (catalog.displayCategory, as in
// Lagersaldo), each with its round check, its name with the amount after it
// ("Mjöl 2 dl (hemma: 1 kg)"), the line under it (the dishes with " · ",
// "Egen vara", or "Saknas i lagret" for a vague line) and the selected
// store's product choice as a chip. The list is counted on the server every
// time it is read; when it changes while it is open, a live region says so.
// A check is saved with setChecked (FR-16) and moves the line at once to
// "I korgen" at the bottom, which is folded: the basket row "6 varor i
// korgen" with "Visa" opens it, and a check there puts the line back. A
// second live region says "Citron i korgen." or "Citron tillbaka på
// listan.", and focus moves to the next line's check. "Lägg till egen vara"
// under the list adds Pontus's own item (FR-17). A tap on a line's name
// opens Listpostdetalj (Story 3.6), where Pontus corrects a recipe line's
// amount or changes an own item; a swipe to the left removes a line (an own
// item) or hides it (a recipe line), with "Ångra" in the short confirmation.
// "Dolda varor (N)" under the list shows the hidden lines, with "Visa igen".
// The detail of a line with a catalog ingredient shows the selected store's
// product choice for it, and its button replaces the detail with the sheet
// Produktval (Story 7.2); the choices sit beside the list and never change
// its count. Pinned above the tab bar: "Kopiera till ICA-varukorgen" (named after the
// store's chain; it copies the basket export of the lines as shown, Story
// 7.3) while there is something to send, and "Lägg i lagret" beside it while
// a line is checked off, which puts every checked line in the pantry and
// takes it off the list (Story 3.7).

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
 * After a check moved a line away, a click from a fresh press of a finger,
 * pen or mouse (or the second click of a double click) on another line's
 * check within this time is taken as the second half of a double tap, which
 * would land on the line that moved up under the pointer, and is ignored.
 * Keys, and activations without a pointer press (VoiceOver, Voice Control,
 * Switch Control), are never ignored. The same limit as the bin (11.1).
 */
export const doubleTapGuardMs = 400;

/** How long an ignored tap's check shows its cue. */
const ignoredCueMs = 400;

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
 * `onSettled` hears how the latest tap of a line ended (`saved` or not), so
 * the list can say so when the line goes back.
 */
function useChecks(
  planId: string | null,
  lines: readonly ShoppingLine[],
  onSettled?: (key: string, checked: boolean, saved: boolean) => void,
) {
  const router = useRouter();
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });
  const saved = useMemo(
    () => (planId === null ? {} : Object.fromEntries(lines.map((line) => [checkId(planId, line.key), line.checked]))),
    [planId, lines],
  );
  const [checks, showCheck] = useOptimistic(saved, (state: Record<string, boolean>, change: { id: string; checked: boolean }) => ({
    ...state,
    [change.id]: change.checked,
  }));
  const [transitionPending, startTransition] = useTransition();
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
        settled.current?.(key, checked, true);
        return;
      }
      if (result.error.code === "unauthorized") {
        router.refresh();
        return;
      }
      settled.current?.(key, checked, false);
      nextNotice.current += 1;
      setNotice({ text: result.error.message, id: nextNotice.current, key });
      if (lost || result.error.code === "shopping_plan_changed") router.refresh();
    });
  }

  // `settling` until every save has answered and the list shows the server's checks again.
  return { checks, toggle, notice, saving: saving > 0, settling: saving > 0 || transitionPending };
}

/** How long a move's announcement waits after focus has moved, so VoiceOver reads both the new focus and the text. */
export const moveAnnouncementDelayMs = 150;

/**
 * What a check that moved a line says ("Citron i korgen."), in a live region
 * of its own beside the recount's, moveAnnouncementDelayMs after the move. A
 * new count each time, so the same text is announced again; a newer text
 * replaces one still waiting. Cleared after announcementMs and when the list
 * is hidden.
 */
function useMoveAnnouncement() {
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const waiting = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(waiting.current);
      setAnnouncement((before) => (before.text ? { ...before, text: "" } : before));
    },
    [],
  );
  useEffect(() => {
    if (!announcement.text) return;
    const { count } = announcement;
    const timer = setTimeout(
      () => setAnnouncement((before) => (before.count === count ? { ...before, text: "" } : before)),
      announcementMs,
    );
    return () => clearTimeout(timer);
  }, [announcement]);
  const announce = (text: string) => {
    clearTimeout(waiting.current);
    waiting.current = setTimeout(
      () => setAnnouncement((before) => ({ text, count: before.count + 1 })),
      moveAnnouncementDelayMs,
    );
  };
  return { announcement, announce };
}

/** Where focus goes after a check moved a line: a line's check, or the basket row's "Visa". */
type FocusTarget = { kind: "check"; key: string } | { kind: "basket-toggle" };
/** Where a line's check is looked for: among the lines left, or in I korgen. */
type FocusArea = "list" | "basket";

/** The element a focus target stands for, if it is shown: a check only inside `area`. */
function focusElement(root: HTMLElement | null, target: FocusTarget, area: FocusArea): HTMLElement | null {
  if (!root) return null;
  if (target.kind === "basket-toggle") return root.querySelector<HTMLElement>("[data-basket-toggle]");
  const container = root.querySelector<HTMLElement>(area === "list" ? "[data-list-lines]" : "[data-testid=basket]");
  const row = [...(container?.querySelectorAll<HTMLElement>("[data-line-key]") ?? [])].find(
    (element) => element.dataset.lineKey === target.key,
  );
  return row?.querySelector<HTMLElement>("[role=checkbox]:not([disabled])") ?? null;
}

/**
 * Moves focus without scrolling the page under a finger; from the keyboard
 * the element is scrolled into view only as far as needed, and the page's
 * scroll-padding (FixedAction) keeps it above the fixed buttons.
 */
function moveFocus(element: HTMLElement, viaPointer: boolean) {
  element.focus({ preventScroll: true });
  if (!viaPointer) element.scrollIntoView?.({ block: "nearest" });
}

/** How long after a pointer went down its click still counts as that press (a VoiceOver or Switch Control activation has none). */
const pressFreshMs = 1000;

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
  const { checks, toggle, notice, saving, settling } = useChecks(planId, savedLines, handleSettled);
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
  const siteName = shownSiteName(site);
  // The lines left, per category; the checked ones are in I korgen, in the same category order.
  const groups = useMemo(() => groupByCategory(lines.filter((line) => !line.checked)), [lines]);
  const leftKeys = groups.flatMap(({ lines: categoryLines }) => categoryLines.map((line) => line.key));
  const inBasket = useMemo(
    () => groupByCategory(lines.filter((line) => line.checked)).flatMap(({ lines: categoryLines }) => categoryLines),
    [lines],
  );
  const basketKeys = inBasket.map((line) => line.key);
  /** I korgen unfolded (Story 3.9): open from the start; the choice is kept per device. */
  const [basketOpen, setBasketOpen] = useState(true);
  useEffect(() => {
    // Read after hydration, so the server and the first render agree.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (readBasketOpen() === false) setBasketOpen(false);
  }, []);
  const changeBasketOpen = (open: boolean) => {
    setBasketOpen(open);
    writeBasketOpen(open);
  };
  /** A line whose check could not be taken back: I korgen opens once it is there again. */
  const [reopenFor, setReopenFor] = useState<string | null>(null);
  if (reopenFor !== null && inBasket.some((line) => line.key === reopenFor)) {
    setReopenFor(null);
    setBasketOpen(true);
  }
  const basketShown = basketOpen && inBasket.length > 0;
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusAfterRemoval(rootRef, removal.focusAfterRef, [...leftKeys, ...(basketShown ? basketKeys : [])]);
  const { announcement: moveAnnouncement, announce } = useMoveAnnouncement();
  const { showToast } = useToast();
  /**
   * Focus to move once the line has moved (the basket row's "Visa" after the
   * first check, a line back in its category, a line that went back): tried
   * once, in the first commit that shows `key` as `checked`, and dropped when
   * Pontus presses or focuses anything else first.
   */
  const pendingFocus = useRef<{ target: FocusTarget; area: FocusArea; key: string; checked: boolean; viaPointer: boolean } | null>(
    null,
  );
  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null) return;
    const line = lines.find((item) => item.key === pending.key);
    if (line && line.checked !== pending.checked) return;
    pendingFocus.current = null;
    const element = focusElement(rootRef.current, pending.target, pending.area);
    if (element) moveFocus(element, pending.viaPointer);
  });
  /**
   * How and when the last press began ("touch", "mouse", "pen" or
   * "keyboard", at the event's timeStamp; `repeat` for a held key), the last
   * click (its timeStamp and click count), and the click that last moved a
   * line, for the double tap guard.
   */
  const lastPress = useRef<{ type: string; at: number; repeat: boolean } | null>(null);
  const lastClick = useRef<{ at: number; detail: number } | null>(null);
  const lastMove = useRef<{ key: string; at: number } | null>(null);
  /** A tap the double tap guard ignored, for a short cue on its check; a new id each time. */
  const [ignored, setIgnored] = useState<{ key: string; id: number } | null>(null);
  useEffect(() => {
    if (!ignored) return;
    const timer = setTimeout(() => setIgnored((before) => (before?.id === ignored.id ? null : before)), ignoredCueMs);
    return () => clearTimeout(timer);
  }, [ignored]);
  /**
   * A check from the list (`checked`) or from I korgen (not `checked`). The
   * press and click are read once. The second click of a double tap or
   * double click, on another line within doubleTapGuardMs of the last move,
   * is ignored with a short cue; an activation without a fresh pointer press
   * (VoiceOver, Voice Control, Switch Control, a key) always counts. Then
   * focus moves, to the next line's check in the same place, else the one
   * before, else the basket row's "Visa" (from the list) or the line itself
   * back in its category (from I korgen); the line moves, and the move is
   * announced.
   */
  const moveLine = (line: ShoppingLine, checked: boolean) => {
    const press = lastPress.current;
    const click = lastClick.current;
    lastPress.current = null;
    lastClick.current = null;
    const clickAt = click?.at ?? null;
    const viaPointer =
      press !== null && press.type !== "keyboard" && clickAt !== null && clickAt >= press.at && clickAt - press.at < pressFreshMs;
    const guarded = clickAt !== null && (viaPointer || (click?.detail ?? 0) > 1);
    const previous = lastMove.current;
    if (guarded && previous && previous.key !== line.key && clickAt - previous.at < doubleTapGuardMs) {
      setIgnored((before) => ({ key: line.key, id: (before?.id ?? 0) + 1 }));
      return;
    }
    lastMove.current = guarded ? { key: line.key, at: clickAt } : null;
    const order = checked ? leftKeys : basketKeys;
    const area: FocusArea = checked ? "list" : "basket";
    const index = order.indexOf(line.key);
    const neighbour = index === -1 ? undefined : (order[index + 1] ?? order[index - 1]);
    const target: FocusTarget = neighbour ? { kind: "check", key: neighbour } : checked ? { kind: "basket-toggle" } : { kind: "check", key: line.key };
    const targetArea: FocusArea = neighbour ? area : "list";
    // Before the line leaves, so focus never falls back to the page.
    const element = target.kind === "check" && target.key === line.key ? null : focusElement(rootRef.current, target, targetArea);
    if (element) {
      pendingFocus.current = null;
      moveFocus(element, viaPointer);
    } else {
      pendingFocus.current = { target, area: targetArea, key: line.key, checked, viaPointer };
    }
    toggle(line.key, checked);
    announce(checked ? inBasketAnnouncement(lineName(line)) : backOnListAnnouncement(lineName(line)));
    // Story 3.9: a check can be taken back from the toast; only the latest one is shown.
    if (checked) {
      showToast(inBasketAnnouncement(lineName(line)).replace(/\.$/, ""), {
        onUndo: () => {
          toggle(line.key, false);
          announce(backOnListAnnouncement(lineName(line)));
        },
      });
    }
  };
  /** The saved checks of the latest taps, by line, to compare with the list once every save has settled. */
  const savedChecks = useRef(new Map<string, boolean>());
  /**
   * A line that went back where it was: its check was not saved, or the
   * server's list disagrees once the save has settled. The move's text is
   * replaced by where the line is now, focus goes to its check, and I korgen
   * opens when the line lands there.
   */
  function lineWentBack(key: string, intended: boolean) {
    const line = lines.find((item) => item.key === key) ?? savedLines.find((item) => item.key === key);
    if (!line) return;
    const back = !intended;
    if (back) setReopenFor(key);
    pendingFocus.current = { target: { kind: "check", key }, area: back ? "basket" : "list", key, checked: back, viaPointer: true };
    announce(back ? inBasketAnnouncement(lineName(line)) : backOnListAnnouncement(lineName(line)));
  }
  function handleSettled(key: string, checked: boolean, saved: boolean) {
    if (saved) savedChecks.current.set(key, checked);
    else {
      savedChecks.current.delete(key);
      lineWentBack(key, checked);
    }
  }
  // Once nothing is being saved, the list shows the server's checks: one that differs from its save went back.
  useEffect(() => {
    if (settling || savedChecks.current.size === 0) return;
    const expected = [...savedChecks.current];
    savedChecks.current.clear();
    for (const [key, checked] of expected) {
      const shown = lines.find((item) => item.key === key);
      if (shown && shown.checked !== checked) lineWentBack(key, checked);
    }
  });
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
  // "Kopiera till ICA-varukorgen": the export is built from the lines as shown, a check not yet saved included.
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
  // The bin on a row asks first, unless Pontus deleted something a minute ago (Story 13.1).
  const { requestDelete, dialog: deleteDialog } = useConfirmDelete();
  // Nothing hidden any more: the sheet closes.
  if (hiddenSheet && hiddenLines.length === 0) setHiddenSheet(false);
  /** A line's row, the same among the lines left and in I korgen. */
  const lineRow = (line: ShoppingLine) => (
    <ShoppingLineRow
      key={line.key}
      line={line}
      meta={lineMetaText(line, plan?.dishTitles ?? {}, siteName, !pantryUnavailable)}
      chip={chipChoice(line, store !== null, productChoices)?.productName ?? null}
      onCheckedChange={(checked) => moveLine(line, checked)}
      onRemove={(moveFocus) => removal.remove(line, moveFocus)}
      onTrash={(press) =>
        requestDelete({
          question: `Ta bort ${line.label} från inköpslistan?`,
          onConfirm: () => removal.remove(line, !press.pointer),
        })
      }
      onOpen={() => openDetail(line)}
      checkingOff={checksUnavailable}
      ignoredTap={ignored?.key === line.key ? ignored.id : null}
    />
  );

  return (
    <div
      ref={rootRef}
      // How a press began, for the double tap guard: a finger's taps only.
      // How a press began, for the double tap guard; any press of Pontus's own drops a focus still waiting.
      onPointerDownCapture={(event) => {
        lastPress.current = { type: event.pointerType, at: event.timeStamp, repeat: false };
        pendingFocus.current = null;
      }}
      onKeyDownCapture={(event) => {
        lastPress.current = { type: "keyboard", at: event.timeStamp, repeat: event.repeat };
        pendingFocus.current = null;
        // A held Enter repeats its click: on a check it would empty the list one line at a time.
        if (event.repeat && (event.key === "Enter" || event.key === " ") && (event.target as HTMLElement).getAttribute("role") === "checkbox") {
          event.preventDefault();
        }
      }}
      onClickCapture={(event) => {
        lastClick.current = { at: event.timeStamp, detail: event.detail };
      }}
      className="flex flex-col gap-6"
    >
      {/* Mounted empty, so a recount is announced when its text arrives. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="list-announcement">
        {announcement.text ? <span key={announcement.count}>{announcement.text}</span> : null}
      </div>
      {/* "Citron i korgen.": what a check just did, apart from the recount's text. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="check-announcement">
        {moveAnnouncement.text ? <span key={moveAnnouncement.count}>{moveAnnouncement.text}</span> : null}
      </div>
      {hasDishes || (plan && (hasLines || plan.skippedCount > 0)) ? (
        // Close under the title, as part of the header.
        <div className="-mt-4 flex flex-col gap-1">
          {hasDishes || hasLines ? (
            <p data-testid="list-summary" className="text-meta text-ink-2">
              {listSummaryText(plan.name, plan.dishCount)}
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
      {/* "Kopiera till ICA-varukorgen" without a store that can be read: nothing was copied. */}
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
            <EmptyState>{hasDishes ? allInStockText(siteName) : emptyPlanText}</EmptyState>
          ) : (
            <div data-list-lines className="flex flex-col gap-4">
              <ProgressRow left={itemsLeft(lines)} checked={inBasket.length} total={lines.length} />
              {groups.map(({ category, lines: categoryLines }) => (
                <CategorySection key={category} category={category}>
                  {categoryLines.map(lineRow)}
                </CategorySection>
              ))}
            </div>
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
          {inBasket.length > 0 ? (
            <Basket open={basketShown} onOpenChange={changeBasketOpen} count={inBasket.length}>
              {inBasket.map(lineRow)}
            </Basket>
          ) : null}
          {hiddenLines.length > 0 ? (
            <Button variant="text" fullWidth aria-haspopup="dialog" onClick={() => setHiddenSheet(true)}>
              {hiddenLinesButtonText(hiddenLines.length)}
            </Button>
          ) : null}
          {deleteDialog}
          <HiddenLinesSheet
            open={hiddenSheet}
            planId={plan.id}
            lines={hiddenLines}
            onShow={own.track}
            vagueText={missingText(siteName, !pantryUnavailable)}
            onClose={() => setHiddenSheet(false)}
          />
          <CustomItemSheet
            open={sheet.open}
            session={sheet.session}
            planId={plan.id}
            searchIngredients={searchIngredients}
            onClose={() => setSheet((current) => ({ ...current, open: false }))}
          />
          {canSend ? (
            <div className="flex flex-wrap justify-center gap-x-2">
              <Button variant="text" onClick={basket.share}>
                {shareButtonText}
              </Button>
              <Button variant="text" onClick={basket.showSteps}>
                {stepsLinkText}
              </Button>
            </div>
          ) : null}
          <ListActions
            // Room for both buttons while the list has lines, so the page does not move when the first check adds one.
            reserve={hasLines && !checksUnavailable ? 2 : 1}
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
          <StepsSheet open={basket.stepsOpen} store={store} onClose={basket.closeSteps} />
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
 * The list's Fast åtgärdsknapp (UX-DR3, Story 11.4): one FixedAction with
 * "Kopiera till ICA-varukorgen" (secondary) alone, or with "Lägg i lagret" (primary)
 * beside it while a line is checked off; FixedAction puts "Lägg i lagret" on
 * top when the two do not fit in a row. Nothing when neither shows.
 */
function ListActions({
  putInPantry,
  send,
  reserve,
}: {
  putInPantry: ReactNode;
  /** The button's text, what a tap does and whether it is off; `null` when there is nothing to send. */
  send: { text: string; onSend: () => void; disabled: boolean } | null;
  /** How many buttons to keep room for (FixedAction). */
  reserve: number;
}) {
  if (!putInPantry && !send) return null;
  return (
    <FixedAction reserve={reserve}>
      {send ? (
        <Button variant="secondary" disabled={send.disabled} onClick={send.onSend}>
          {send.text}
        </Button>
      ) : null}
      {putInPantry}
    </FixedAction>
  );
}

/**
 * Framstegsrad (DESIGN.md, progress-row; FR-43): a white card at the top of
 * the list with "8 varor kvar" and "6 av 14 i korgen" on one line, and the
 * meter under it, counted over the lines not hidden; "Allt ligger i korgen"
 * when everything is checked off. The meter is hidden from screen readers:
 * the text says the same.
 */
function ProgressRow({ left, checked, total }: { left: number; checked: number; total: number }) {
  const text = progressText(left, checked, total);
  return (
    <div data-testid="list-progress" className="flex flex-col gap-3 rounded-lg bg-surface p-4">
      {/* The space keeps the two texts apart for screen readers; on screen the flex gap does. */}
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-row-title text-ink">{text.left}</span>
        {text.basket ? (
          <>
            {" "}
            <span className="text-body text-ink-3">{text.basket}</span>
          </>
        ) : null}
      </p>
      <Meter value={total === 0 ? 0 : checked / total} />
    </div>
  );
}

/**
 * A display category's lines: the heading with its tile and count, and the
 * lines in a list group named by it. A plain div, so a category is no
 * landmark of its own (components/README.md).
 */
function CategorySection({ category, children }: { category: Category; children: ReactNode[] }) {
  const headingId = useId();
  return (
    <div data-testid="list-category" className="flex flex-col gap-2">
      <CategoryHeader id={headingId} category={category} count={children.length} />
      <ListGroup labelledBy={headingId} className="@container">{children}</ListGroup>
    </div>
  );
}

/**
 * I korgen (DESIGN.md, basket-row; FR-43): the basket row "6 varor i korgen",
 * a heading so that heading navigation finds the basket also when it is
 * folded, with the text button "Visa" ("Visa I korgen (6 varor)" for screen
 * readers), which unfolds the heading "I korgen" and the checked lines under
 * it, struck through, and becomes "Dölj".
 */
function Basket({
  open,
  onOpenChange,
  count,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** The checked lines' rows, shown when unfolded. */
  children: ReactNode;
}) {
  const headingId = useId();
  const regionId = useId();
  return (
    <>
      <div data-testid="basket-row" className="flex items-center justify-between gap-3 pl-1">
        <h2 id={headingId} className="min-w-0 text-body text-ink-2">
          {basketText(count)}
        </h2>
        <Button
          variant="text"
          data-basket-toggle
          aria-label={basketToggleText(open, count)}
          aria-expanded={open}
          // Only while the region is there, so it never points at nothing.
          aria-controls={open ? regionId : undefined}
          onClick={() => onOpenChange(!open)}
          // In px like the page's gutter, so a larger root font never pushes it past the edge.
          className="-mr-[12px] shrink-0"
        >
          {open ? "Dölj" : "Visa"}
        </Button>
      </div>
      {open ? (
        <div id={regionId} data-testid="basket">
          <ListGroup labelledBy={headingId} className="@container">{children}</ListGroup>
        </div>
      ) : null}
    </>
  );
}

/**
 * One listpost (DESIGN.md, list-row; FR-43): the square check (Checkbox,
 * 22 px in a 44 × 44 px tap area) to the left, the name with the amount after
 * it in ink-2 ("Gul lök 2 st"), the line under it, and the product chip to
 * the right. Checked (in I korgen), the name is struck through in ink-3. The
 * check and the text are separate tap targets: with `onOpen`, the text is a
 * button that opens Listpostdetalj. With `onRemove`, swiping the row to the
 * left reveals "Ta bort" (SwipeRow), also reached with Tab after the row.
 */
const basketOpenKey = "matkoll:basket-open";
function readBasketOpen(): boolean | null {
  try {
    const value = window.localStorage.getItem(basketOpenKey);
    return value === null ? null : value === "1";
  } catch {
    return null;
  }
}
function writeBasketOpen(open: boolean) {
  try {
    window.localStorage.setItem(basketOpenKey, open ? "1" : "0");
  } catch {
    // Not kept: I korgen is open again next time.
  }
}

export function ShoppingLineRow({
  line,
  meta,
  chip = null,
  onCheckedChange,
  onRemove,
  onTrash,
  onOpen,
  checkingOff = false,
  ignoredTap = null,
}: {
  line: ShoppingLine;
  /** The line under the name (lineMetaText), or `null`. */
  meta: string | null;
  /** The product choice's name for the chip, or `null`. */
  chip?: string | null;
  onCheckedChange: (checked: boolean) => void;
  /** Removes or hides the line; `moveFocus` when it came from the keyboard. */
  onRemove?: (moveFocus: boolean) => void;
  /** The bin on the right (Story 13.1); the caller asks, then removes with `onRemove`'s action. */
  onTrash?: (press: TrashPress) => void;
  /** Opens the line's Listpostdetalj. */
  onOpen?: () => void;
  /** Checking is off: the saved checks could not be read. */
  checkingOff?: boolean;
  /** A tap on the check was ignored (doubleTapGuardMs): a new number each time, for a short cue; `null` for none. */
  ignoredTap?: number | null;
}) {
  const metaId = useId();
  const chipId = useId();
  const amount = lineAmountText(line);
  const title = (
    <>
      {/* A span of its own, so the name can be found apart from the amount. */}
      <span>{line.label}</span>
      {amount ? (
        <>
          {" "}
          {/* Struck through with the name when checked, and in its ink-3. */}
          <span className={cx("font-normal", !line.checked && "text-ink-2")}>{amount}</span>
        </>
      ) : null}
    </>
  );
  const shared = {
    as: "div" as const,
    title,
    // An id, so the check is described by it ("Saknas i Stugan · Korv stroganoff").
    meta: meta ? <span id={metaId}>{meta}</span> : null,
    crossedOut: line.checked,
    // The strike-through, said: "Grädde 3 dl, i korgen".
    srStatus: line.checked ? "i korgen" : undefined,
    leading: (
      <Checkbox
        checked={line.checked}
        onCheckedChange={onCheckedChange}
        label={checkLabel(line)}
        disabled={checkingOff}
        describedBy={[meta ? metaId : null, chip ? chipId : null].filter(Boolean).join(" ")}
        // The ignored tap's cue: a ring that fades, without motion when "Minska rörelse" is on.
        className={
          ignoredTap === null || ignoredTap === undefined
            ? undefined
            : "motion-safe:animate-ignored-tap motion-reduce:outline-2 motion-reduce:-outline-offset-2 motion-reduce:outline-accent"
        }
      />
    ),
    trailing:
      chip || onTrash ? (
        <>
          {chip ? <ProductChip name={chip} id={chipId} /> : null}
          {onTrash ? (
            <TrashButton label={`Ta bort ${line.label}`} onPress={(_bin, press) => onTrash(press)} />
          ) : null}
        </>
      ) : undefined,
  };
  const row = onOpen ? (
    <ListRow
      {...shared}
      onPress={onOpen}
      pressProps={{ "data-testid": "shopping-line-name", "aria-haspopup": "dialog" }}
    />
  ) : (
    <ListRow {...shared} />
  );
  return (
    <li data-testid="shopping-line" data-line-key={line.key} data-checked={line.checked}>
      {onRemove ? (
        <SwipeRow actionLabel="Ta bort" actionName={`Svep bort ${line.label}`} onAction={(via) => onRemove(via === "keyboard")}>
          {row}
        </SwipeRow>
      ) : (
        row
      )}
    </li>
  );
}
