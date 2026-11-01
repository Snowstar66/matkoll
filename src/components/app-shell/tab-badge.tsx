"use client";

import { useAiJobs } from "@/lib/ai-jobs-client";
import { isFinishedWithNews } from "@/lib/ai-job-shape";
import type { Destination } from "./destinations";

// The badge on a tab for finished AI jobs (Story 12.4, FR-48, DESIGN.md
// tab-badge): how many of the results shown on the tab that Pontus has not
// seen, also those that did not go, never on the tab he stands on. Always
// accent, never red, and "9+" over nine.

/** How many unseen finished AI jobs the tab's surface shows; 0 on the tab Pontus is on. */
export function useAiBadgeCount(destination: Destination, current: boolean): number {
  const { jobs } = useAiJobs();
  if (current || !destination.aiKinds) return 0;
  const kinds = destination.aiKinds;
  return jobs.filter((job) => isFinishedWithNews(job) && !job.seen && kinds.includes(job.kind)).length;
}

/** The tab's name for a screen reader with the badge: "Recept, 1 nytt AI-resultat", or with the tab's own unit "Förråd, 1 nytt kort". */
export function badgeName(label: string, count: number, unit: readonly [one: string, many: string] = ["nytt AI-resultat", "nya AI-resultat"]): string {
  return `${label}, ${count} ${count === 1 ? unit[0] : unit[1]}`;
}

/**
 * The round label on the tab's icon, at least 18 px. The tab's own name says
 * what it means. A `b`, not a span: the tab's label is the first span of its link.
 */
export function TabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <b
      aria-hidden="true"
      data-testid="tab-badge"
      className="absolute -top-1 left-full -ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-badge text-surface"
    >
      {count > 9 ? "9+" : count}
    </b>
  );
}
