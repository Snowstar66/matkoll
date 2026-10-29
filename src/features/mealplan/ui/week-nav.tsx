import Link from "next/link";
import { addWeeks, currentWeekStart, maxWeeksAhead, weekName, weekOffsetLabel, weeksBetween, weekQuery } from "../domain/week";

const arrowClasses = "flex size-tap shrink-0 items-center justify-center rounded-full text-row-title text-accent";

/**
 * Week navigation on Matsedel (Story 13.7): "‹ Vecka 44 ›" with "Denna
 * vecka", "Nästa vecka" or "Om 2 veckor" under the name, and "Idag" back to
 * this week when another week is shown. Plain links, so the viewed week is in
 * the address (`?vecka=2026-W45`) and a reload keeps it. "‹" goes back only
 * to this week: earlier weeks are Tidigare's (Story 3.2). Server-rendered;
 * `now` is the server's moment, the same one the page counted the week from.
 */
export function WeekNav({ weekStart, now = new Date() }: { weekStart: string; now?: Date }) {
  const thisWeek = currentWeekStart(now);
  const offset = weeksBetween(thisWeek, weekStart);
  const previous = offset > 0 ? addWeeks(weekStart, -1) : null;
  const next = offset < maxWeeksAhead ? addWeeks(weekStart, 1) : null;
  const href = (week: string) => `/matsedel${weekQuery(week, now)}`;
  return (
    <nav aria-label="Vecka" data-testid="week-nav" className="flex items-center justify-between gap-1">
      {previous ? (
        <Link href={href(previous)} aria-label="Föregående vecka" className={arrowClasses} scroll={false}>
          <span aria-hidden="true">‹</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="size-tap shrink-0" />
      )}
      <div className="flex min-w-0 flex-col items-center text-center">
        <p aria-live="polite" className="flex flex-wrap items-baseline justify-center gap-x-2">
          <span data-testid="week-name" className="text-body font-semibold text-ink">
            {weekName(weekStart)}
          </span>
          <span data-testid="week-label" className="text-meta text-ink-2">
            {weekOffsetLabel(offset)}
          </span>
        </p>
        {offset !== 0 ? (
          <Link href="/matsedel" scroll={false} className="flex min-h-tap items-center px-3 text-meta font-semibold text-accent">
            Idag
          </Link>
        ) : null}
      </div>
      {next ? (
        <Link href={href(next)} aria-label="Nästa vecka" className={arrowClasses} scroll={false}>
          <span aria-hidden="true">›</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="size-tap shrink-0" />
      )}
    </nav>
  );
}
