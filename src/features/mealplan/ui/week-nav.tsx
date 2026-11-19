import { addWeeks, currentWeekStart, overviewWeeks, weekOffsetLabel, weekParam, weeksBetween } from "../domain/week";
import { WeekSelect } from "./week-select";

/**
 * The week as a discreet dropdown (WeekSelect), on Inköpslista and Matsedel: "Denna vecka" and "Nästa vecka", and a
 * week further ahead (`?vecka=`) as one more entry. The addresses are `?vecka=`, so a reload keeps the week.
 * `withHistory` (Matsedel): last week and "Äldre veckor ›" are offered when the Tillval "Visa tidigare vecka" is on.
 */
export function WeekSelectNav({
  weekStart,
  now = new Date(),
  basePath = "/matsedel",
  keepParams,
  withHistory = false,
}: {
  weekStart: string;
  now?: Date;
  basePath?: string;
  keepParams?: Record<string, string>;
  withHistory?: boolean;
}) {
  const thisWeek = currentWeekStart(now);
  const weeks = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(thisWeek, offset));
  const lastWeek = addWeeks(thisWeek, -1);
  // Last week is WeekSelect's own entry (it depends on the Tillval, which only the browser knows).
  if (!weeks.includes(weekStart) && weekStart !== lastWeek) weeks.push(weekStart);
  // Always `?vecka=`, also for this week: the plain address means the week last viewed (UX-04).
  const hrefFor = (week: string) => `${basePath}?${new URLSearchParams({ vecka: weekParam(week), ...keepParams }).toString()}`;
  const options = weeks.map((week) => ({ week, label: weekOffsetLabel(weeksBetween(thisWeek, week)), href: hrefFor(week) }));
  const history = withHistory
    ? { lastWeek: { week: lastWeek, label: weekOffsetLabel(-1), href: hrefFor(lastWeek) }, thisWeekHref: hrefFor(thisWeek), olderHref: "/matsedel/tidigare" }
    : undefined;
  return <WeekSelect weekStart={weekStart} options={options} history={history} />;
}
