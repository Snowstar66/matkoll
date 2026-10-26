"use client";

import { useEffect, useId, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Notice } from "@/components/notice";
import type { ShoppingLine } from "../domain/compute-list";
import {
  allAtHomeText,
  emptyPlanText,
  groupBySection,
  itemsLeft,
  lineAmountText,
  listSummaryText,
  originsText,
  pantryUnreadText,
  recountedText,
  skippedDishesText,
} from "../domain/list-text";

// Inköpslista (FR-15, UX-DR9): the current plan's name, number of dishes and
// items left under the title, then the lines per store section in the fixed
// order, each with its name, "från [rätt]" and the amount to the right ("2 dl
// (hemma: 1 kg)", "Finns hemma?"). The list is counted on the server every
// time it is read; when it changes while it is open, a live region says so.

export type ShoppingListProps = {
  /**
   * The current plan, or `null` when there is none. `dishCount` is the dishes
   * the list is counted from; `skippedCount` those left out because their
   * recipe is deleted.
   */
  plan: {
    name: string;
    dishCount: number;
    skippedCount: number;
    dishTitles: Readonly<Record<string, string>>;
  } | null;
  /** computeList's lines, sorted by section and name. */
  lines: readonly ShoppingLine[];
  /** The pantry could not be read, so nothing is taken off. */
  pantryUnavailable: boolean;
};

/** How long an announcement stays in the live region before it is cleared. */
export const announcementMs = 5000;

/** Everything a line shows, so any visible change counts as a recount. */
function signatureOf(lines: readonly ShoppingLine[]): string {
  return JSON.stringify(
    lines.map((line) => [
      line.key,
      line.label,
      line.amount,
      line.unit,
      line.pantryNote ?? null,
      line.isVague,
      line.origins,
      line.multiplier ?? null,
      line.checked,
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
function useRecountAnnouncement(lines: readonly ShoppingLine[]): { text: string; count: number } {
  const signature = signatureOf(lines);
  const latest = useRef(signature);
  /** The lines last shown; `null` while the page is hidden. */
  const shown = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState({ text: "", count: 0 });
  const left = itemsLeft(lines);

  useEffect(() => {
    latest.current = signature;
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
    if (shown.current !== null && shown.current !== signature) {
      // A new count each time, so the same text is announced again.
      setAnnouncement((before) => ({ text: recountedText(left), count: before.count + 1 }));
    }
    if (shown.current !== null) shown.current = signature;
  }, [signature, left]);

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

export function ShoppingList({ plan, lines, pantryUnavailable }: ShoppingListProps) {
  const announcement = useRecountAnnouncement(lines);
  const hasDishes = plan !== null && plan.dishCount > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Mounted empty, so a recount is announced when its text arrives. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="list-announcement">
        {announcement.text ? <span key={announcement.count}>{announcement.text}</span> : null}
      </div>
      {hasDishes || (plan && plan.skippedCount > 0) ? (
        // Close under the title, as part of the header.
        <div className="-mt-4 flex flex-col gap-1">
          {hasDishes ? (
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
      {!hasDishes ? (
        <EmptyState>{emptyPlanText}</EmptyState>
      ) : lines.length === 0 ? (
        <EmptyState>{allAtHomeText}</EmptyState>
      ) : (
        groupBySection(lines).map(({ section, lines: sectionLines }) => (
          <ListSection key={section} section={section} lines={sectionLines} dishTitles={plan.dishTitles} />
        ))
      )}
    </div>
  );
}

function ListSection({
  section,
  lines,
  dishTitles,
}: {
  section: string;
  lines: readonly ShoppingLine[];
  dishTitles: Readonly<Record<string, string>>;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-section-label text-ink-2">
        {section}
      </h2>
      <ul aria-labelledby={headingId} className="flex flex-col overflow-hidden rounded-lg bg-surface px-4">
        {lines.map((line) => (
          <ShoppingLineRow key={line.key} line={line} dishTitles={dishTitles} />
        ))}
      </ul>
    </section>
  );
}

/** One listpost: the name with "från [rätt]" under it, and the amount to the right. */
export function ShoppingLineRow({
  line,
  dishTitles,
}: {
  line: ShoppingLine;
  dishTitles: Readonly<Record<string, string>>;
}) {
  const from = originsText(line.origins, dishTitles);
  const amount = lineAmountText(line);
  return (
    <li
      data-testid="shopping-line"
      data-line-key={line.key}
      className="flex min-h-tap items-center justify-between gap-3 border-t border-hairline py-2 first:border-t-0"
    >
      {/* The spaces keep the words apart for screen readers. */}
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-ink">{line.label}</span>
        {from ? <span className="text-meta text-ink-2"> {from}</span> : null}
      </span>
      {amount ? <span className="shrink-0 text-right text-body text-ink-2"> {amount}</span> : null}
    </li>
  );
}
