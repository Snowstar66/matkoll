import { isFinishedWithNews, type AiJob } from "@/lib/ai-job-shape";

// What the Förråd tab's badge counts (Story 12.4), told per room on the Förråd
// overview: a card read that Pontus has not seen yet. Seen when its room is
// opened. A job whose card is gone (removed, replaced by Ta om, its room
// cleared) or that failed is marked seen when the overview loads, so the badge
// never stays with nothing to open. Pure.

/** A things job with something unseen: done or failed, not seen yet. */
export function isUnseenThingJob(job: Pick<AiJob, "kind" | "status" | "seen">): boolean {
  return job.kind === "things" && !job.seen && isFinishedWithNews(job);
}

/** The card a things job read, from its context; null when it has none. */
export function jobCardId(job: Pick<AiJob, "context">): string | null {
  const id = job.context.photoId;
  return typeof id === "string" ? id : null;
}

/** The place a things job's card was taken in, from its context; null when it has none. */
export function jobPlaceId(job: Pick<AiJob, "context">): string | null {
  const id = job.context.placeId;
  return typeof id === "string" ? id : null;
}

/** Whether a things job's card is in a room with these places and cards (a card moved with its room is found by its id). */
export function isJobInRoom(job: Pick<AiJob, "context">, placeIds: readonly string[], cardIds: readonly string[]): boolean {
  const place = jobPlaceId(job);
  const card = jobCardId(job);
  return (place !== null && placeIds.includes(place)) || (card !== null && cardIds.includes(card));
}

/** Where a card is now: its boende and room. */
export type CardWhere = { id: string; siteId: string; roomKey: string };

/** The most cards one lookup asks about. */
export const maxLocatedCards = 50;

/** "1 nytt kort", "2 nya kort": a room's row on the overview, and the Förråd tab's name for a screen reader. */
export function newCardsText(count: number): string {
  return count === 1 ? "1 nytt kort" : `${count} nya kort`;
}
