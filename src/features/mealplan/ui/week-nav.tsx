import Link from "next/link";
import { weekRangeText } from "../domain/meal-plan";
import { addWeeks, currentWeekStart, overviewWeeks, weekFillText, weekNumber, weeksBetween, weekQuery, weekTileLabel, weekTileName } from "../domain/week";

/**
 * The week control on Matsedel and Inköpslista (Story 14.5, Stories 13.7,
 * 13.9 and 3.10 before it): a calm segmented track with this week, next week
 * and the week after as equal segments. The viewed week is a white, slightly
 * raised segment; the others lie flat on the track. Each segment has the label
 * on the first line and the dish count on the second ("3 rätter", "Tom"). A
 * week further ahead (reached with `?vecka=`) gets a fourth, selected segment.
 * Plain links, so the viewed week is in the address (`?vecka=2026-W45`) and a
 * reload keeps it. Under the track: the viewed week and its dates, and
 * "Tidigare" to the earlier plans (Story 3.2). Server-rendered; `now` is the
 * server's moment, the same one the page counted the week from, and `counts`
 * are the dishes by week (getWeekCounts).
 */
export function WeekNav({
  weekStart,
  counts = {},
  now = new Date(),
  basePath = "/matsedel",
  showHistory = true,
}: {
  weekStart: string;
  counts?: Record<string, number>;
  now?: Date;
  /** The page the segments lead to; Inköpslista reuses them (Story 3.10). */
  basePath?: string;
  /** "Tidigare" beside the dates, which only Matsedel has. */
  showHistory?: boolean;
}) {
  const thisWeek = currentWeekStart(now);
  const weeks = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(thisWeek, offset));
  if (!weeks.includes(weekStart)) weeks.push(weekStart);
  return (
    <nav aria-label="Vecka" data-testid="week-nav" className="flex flex-col gap-2.5">
      <ul
        className="grid gap-[3px] rounded-md bg-hairline p-[3px]"
        style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}
      >
        {weeks.map((week) => {
          const offset = weeksBetween(thisWeek, week);
          const count = counts[week] ?? 0;
          const selected = week === weekStart;
          return (
            <li key={week} className="flex">
              <Link
                href={`${basePath}${weekQuery(week, now)}`}
                scroll={false}
                data-testid="week-tile"
                aria-current={selected ? "page" : undefined}
                aria-label={weekTileName(week, offset, count)}
                className={`flex min-h-tap min-w-0 flex-1 flex-col items-center justify-center rounded-[11px] px-1 py-1.5 text-center leading-[1.2] [overflow-wrap:normal] ${
                  selected ? "segment-on shadow-[0_1px_3px_rgb(0_0_0/0.16)] ring-1 ring-border" : ""
                }`}
              >
                <span aria-hidden="true" className={`text-body font-semibold ${selected ? "text-ink" : "text-ink-2"}`}>
                  {weekTileLabel(offset)}
                </span>
                <span
                  aria-hidden="true"
                  data-testid="week-count"
                  className={`text-[13px] ${selected ? "font-semibold text-accent dark:text-ink" : "text-ink-2"}`}
                >
                  {weekFillText(count)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 px-1">
        <p data-testid="week-range" className="flex min-w-0 items-center gap-2 text-meta text-ink-2">
          <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-mint text-[13px] leading-none">
            {"\u{1F4C5}"}
          </span>
          <span className="min-w-0">
            v. {weekNumber(weekStart)} {"\u00B7"} {weekRangeText(weekStart)}
          </span>
        </p>
        {showHistory ? (
          <Link
            href="/matsedel/tidigare"
            aria-label="Tidigare veckor"
            className="flex min-h-tap shrink-0 items-center text-meta font-semibold text-accent"
          >
            Tidigare {"\u203A"}
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
