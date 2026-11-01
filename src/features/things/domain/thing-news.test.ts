import { describe, expect, it } from "vitest";
import { isJobInRoom, isUnseenThingJob, jobCardId, newCardsText } from "./thing-news";

const job = (extra: Partial<{ kind: "things" | "suggest"; status: "done" | "failed" | "running"; seen: boolean; context: Record<string, unknown> }> = {}) => ({
  kind: "things" as const,
  status: "done" as const,
  seen: false,
  context: { placeId: "p1", photoId: "c1" },
  ...extra,
});

describe("the Förråd tab's news per room (Pontus 1 Nov)", () => {
  it("counts a things job that is done or failed and not seen", () => {
    expect(isUnseenThingJob(job())).toBe(true);
    expect(isUnseenThingJob(job({ status: "failed" }))).toBe(true);
    expect(isUnseenThingJob(job({ status: "running" }))).toBe(false);
    expect(isUnseenThingJob(job({ seen: true }))).toBe(false);
    expect(isUnseenThingJob(job({ kind: "suggest" }))).toBe(false);
  });

  it("finds the job's room by its place or, for a card moved with its room, by the card", () => {
    expect(jobCardId(job())).toBe("c1");
    expect(jobCardId(job({ context: {} }))).toBeNull();
    expect(isJobInRoom(job(), ["p1"], [])).toBe(true);
    expect(isJobInRoom(job(), ["p2"], ["c1"])).toBe(true);
    expect(isJobInRoom(job(), ["p2"], ["c2"])).toBe(false);
  });

  it("says 1 nytt kort, 2 nya kort", () => {
    expect(newCardsText(1)).toBe("1 nytt kort");
    expect(newCardsText(2)).toBe("2 nya kort");
  });
});
