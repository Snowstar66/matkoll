"use client";

import { useAiJobs } from "@/lib/ai-jobs-client";
import { isFinishedWithNews } from "@/lib/ai-job-shape";
import { newsKey } from "@/lib/news";
import { useNews } from "@/lib/news-client";
import type { Destination } from "./destinations";

// The badge on a tab for finished AI jobs (Story 12.4, FR-48, DESIGN.md
// tab-badge): how many of the results shown on the tab that Pontus has not
// seen, also those that did not go, never on the tab he stands on. Always
// accent, never red, and "9+" over nine. Since Story 23.1 it also counts what
// someone else added on the tab since this device last looked (Inköpslista,
// Förråd). Förråd's two kinds are one number: a card read by the AI and a new
// card from another phone are often the same card, so they count once.

/**
 * How many unseen finished AI jobs and how much news from others the tab's
 * surface shows, each card once; 0 on the tab Pontus is on.
 */
export function useBadgeCount(destination: Destination, current: boolean): number {
  const { jobs } = useAiJobs();
  const news = useNews();
  if (current) return 0;
  const kinds = destination.aiKinds ?? [];
  const keys = new Set(destination.newsTab ? news[destination.newsTab] : []);
  for (const job of jobs) {
    if (!isFinishedWithNews(job) || job.seen || !kinds.includes(job.kind)) continue;
    const photoId = job.context.photoId;
    keys.add(typeof photoId === "string" ? newsKey.card(photoId) : `job:${job.id}`);
  }
  return keys.size;
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
