"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, type RefObject, useEffect, useId, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { Button } from "@/components/button";
import { CheckCircle } from "@/components/check-circle";
import { cx } from "@/components/cx";
import { EmptyState } from "@/components/empty-state";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { SwipeRow } from "@/components/swipe-row";
import { fail, ok, type Result } from "@/lib/errors";
import { setChecked } from "../actions/set-checked";
import type { CheckChange } from "../domain/check";
import type { ShoppingLine } from "../domain/compute-list";
import {
  allAtHomeText,
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
  skippedDishesText,
} from "../domain/list-text";
import { CustomItemSheet } from "./custom-item-sheet";
import { HiddenLinesSheet } from "./hidden-lines-sheet";
import { LineDetailSheet } from "./line-detail-sheet";
import { useLineRemoval } from "./line-removal";
import { useOwnChanges } from "./own-changes";

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
// varor (N)" under the list shows the hidden lines, with "Visa igen".

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
   * Searches the catalog for the suggestions in Lägg till egen vara
   * (catalog.searchIngredients, passed down from the page, AD-1). Without
   * it, the sheet suggests nothing.
   */
  searchIngredients?: SearchIngredients;
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
 */
function useRecountAnnouncement(
  lines: readonly ShoppingLine[],
  planId: string | null,
  touched: ReadonlySet<string>,
): { text: string; count: number } {
  const latest = useRef({ lines, touched });
  /**
   * The lines last shown and the lines touched then; `null` while the page
   * is hidden. A line touched then or now is left out of both sides, so a
   * line that stops being touched is never announced.
   */
  const shown = useRef<{ lines: readonly ShoppingLine[]; touched: ReadonlySet<string> } | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const left = itemsLeft(lines);

  useEffect(() => {
    latest.current = { lines, touched };
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
    if (signatureOf(before.lines, planId, either) !== signatureOf(lines, planId, either)) {
      // A new count each time, so the same text is announced again.
      setAnnouncement((previous) => ({ text: recountedText(left), count: previous.count + 1 }));
    }
    shown.current = { lines, touched };
  }, [lines, left, planId, touched]);

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
    startTransition(async () => {
      showCheck({ id, checked });
      const { result, lost } = await save({ planId, key, checked });
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

  return { checks, toggle, notice };
}

/** No hidden lines: for a list rendered without them. */
const noLines: readonly ShoppingLine[] = [];

/** No suggestions: for a list rendered without the catalog's search. */
const noSuggestions: SearchIngredients = async () => ok([]);

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
  searchIngredients = noSuggestions,
}: ShoppingListProps) {
  const planId = plan?.id ?? null;
  const { checks, toggle, notice } = useChecks(planId, savedLines);
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
  // The sets are new each render; one set per content, so the announcement's effect runs only on a change.
  const touchedIds = [...new Set([...removal.touched, ...own.touched])].sort().join("\n");
  const touched = useMemo(() => new Set(touchedIds ? touchedIds.split("\n") : []), [touchedIds]);
  const announcement = useRecountAnnouncement(lines, planId, touched);
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
      {plan === null ? (
        <EmptyState>{emptyPlanText}</EmptyState>
      ) : (
        <>
          {!hasLines ? (
            // "Allt finns hemma." only when the list has no lines at all, own items included.
            <EmptyState>{hasDishes ? allAtHomeText : emptyPlanText}</EmptyState>
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
              onClose={() => setDetail((current) => (current ? { ...current, open: false } : current))}
            />
          ) : null}
        </>
      )}
    </div>
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
