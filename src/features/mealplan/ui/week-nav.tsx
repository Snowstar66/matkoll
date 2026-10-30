import Link from "next/link";
import { addWeeks, currentWeekStart, overviewWeeks, weekNumber, weeksBetween, weekQuery, weekTileLabel, weekTileName } from "../domain/week";

/**
 * The week overview on Matsedel (Story 13.9): one row of three tiles, this
 * week, next week and the week after, each with its week number, a short label
 * and how many dishes are planned ("🍽 3", or a muted "–" when empty). The
 * viewed week is highlighted with the accent; a week further ahead (reached
 * with `?vecka=`) gets a fourth, selected tile. Plain links, so the viewed
 * week is in the address (`?vecka=2026-W45`) and a reload keeps it. "Tidigare
 * veckor" leads to the earlier plans (Story 3.2). Server-rendered; `now` is
 * the server's moment, the same one the page counted the week from, and
 * `counts` are the dishes by week (getWeekCounts).
 */
export function WeekNav({
  weekStart,
  counts = {},
  now = new Date(),
}: {
  weekStart: string;
  counts?: Record<string, number>;
  now?: Date;
}) {
  const thisWeek = currentWeekStart(now);
  const weeks = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(thisWeek, offset));
  if (!weeks.includes(weekStart)) weeks.push(weekStart);
  return (
    <nav aria-label="Vecka" data-testid="week-nav" className="flex flex-col gap-1">
      <ul className="grid grid-cols-3 gap-2">
        {weeks.map((week) => {
          const offset = weeksBetween(thisWeek, week);
          const count = counts[week] ?? 0;
          const selected = week === weekStart;
          return (
            <li key={week} className="flex">
              <Link
                href={`/matsedel${weekQuery(week, now)}`}
                scroll={false}
                data-testid="week-tile"
                aria-current={selected ? "page" : undefined}
                aria-label={weekTileName(week, offset, count)}
                className={`flex min-h-tap min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center ${
                  selected ? "bg-accent text-on-accent" : "bg-surface text-ink"
                }`}
              >
                <span aria-hidden="true" className="text-body font-semibold">
                  v. {weekNumber(week)}
                </span>
                <span aria-hidden="true" className={`text-meta break-words ${selected ? "" : "text-ink-2"}`}>
                  {weekTileLabel(offset)}
                </span>
                <span
                  aria-hidden="true"
                  data-testid="week-count"
                  className={`text-meta font-semibold ${count === 0 && !selected ? "text-ink-3" : ""}`}
                >
                  {count === 0 ? "–" : `\u{1F37D} ${count}`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/matsedel/tidigare" className="flex min-h-tap items-center self-start px-1 text-meta font-semibold text-accent">
        Tidigare veckor
      </Link>
    </nav>
  );
}
