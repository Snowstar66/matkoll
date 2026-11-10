// Nyheter: what is new in Livskoll, written for the people who use it (no
// technical words), newest first. A change people can see gets an entry in the
// same PR: NEW NEWS = ADD ONE NEW FILE in releases/, named <date>-<slug>.ts
// (copy a neighbour). Never edit this index: it collects every file in
// releases/ by itself (import.meta.glob, works in Next/Turbopack and Vitest), so
// PRs no longer conflict here. Each entry has a date (YYYY-MM-DD), a title and 2–5
// short bullets. Order: date, then file name, both newest first (the older files
// carry a two-digit rank after the date to keep their order); releases.test.ts
// keeps the order and the dates in check.

import type { Release } from "./release";

export type { Release } from "./release";

const modules = import.meta.glob<{ release: Release }>("./releases/*.ts", { eager: true });

export const releases: readonly Release[] = Object.entries(modules)
  .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
  .map(([, module]) => module.release)
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/** The newest entry's date: what "Nytt sedan sist" compares with. */
export const latestReleaseDate = releases[0]!.date;

/** The entries grouped by day, newest first, for the page. */
export function releasesByDate(list: readonly Release[] = releases): { date: string; entries: Release[] }[] {
  const groups: { date: string; entries: Release[] }[] = [];
  for (const release of list) {
    const last = groups.at(-1);
    if (last?.date === release.date) last.entries.push(release);
    else groups.push({ date: release.date, entries: [release] });
  }
  return groups;
}

const longMonths = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

/** "2026-11-04" → "4 november 2026". */
export function releaseDateText(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${longMonths[month! - 1]} ${year}`;
}
