import { createHash } from "node:crypto";

/**
 * The id of the dish a draft puts on a day: the same draft and day always give the same id, and add_to_plan returns
 * the row it already has for an id, so a retry or a second tap can never add a dish twice.
 */
export function dishIdFor(draftId: string, dayIndex: number): string {
  const hex = createHash("sha256").update(`week-agent:${draftId}:${dayIndex}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
