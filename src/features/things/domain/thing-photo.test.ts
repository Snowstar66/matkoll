import { describe, expect, it } from "vitest";
import {
  cardDateText,
  cardFailureText,
  clampTakenAt,
  readingStaleMs,
  shortDateText,
  shownStatus,
  thingPhotoFormSchema,
  thingPhotoPath,
} from "./thing-photo";

const uuid = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";

describe("thingPhotoPath", () => {
  it("is the user's folder, the place and the card's id, with the file's extension", () => {
    expect(thingPhotoPath("u", "p", "c", "image/jpeg")).toBe("u/p/c.jpg");
    expect(thingPhotoPath("u", "p", "c", "image/png")).toBe("u/p/c.png");
  });
});

describe("the date", () => {
  it("is the day in Swedish time, as '31 okt'", () => {
    expect(shortDateText(new Date("2026-10-31T10:00:00Z"))).toBe("31 okt");
    // 23:30 UTC on the 30th is already the 31st in Sweden (UTC+1 after the clock change).
    expect(shortDateText(new Date("2026-10-30T23:30:00Z"))).toBe("31 okt");
    expect(shortDateText(new Date("2026-03-01T12:00:00Z"))).toBe("1 mars");
    expect(cardDateText(new Date("2026-10-31T10:00:00Z"))).toBe("Kort från 31 okt");
  });

  it("clamps a card's time to the last day and never the future", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    expect(clampTakenAt(new Date("2026-10-31T11:00:00Z"), now).toISOString()).toBe("2026-10-31T11:00:00.000Z");
    expect(clampTakenAt(new Date("2020-01-01T00:00:00Z"), now).toISOString()).toBe("2026-10-30T12:00:00.000Z");
    expect(clampTakenAt(new Date("2030-01-01T00:00:00Z"), now).toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });
});

describe("a card's state", () => {
  const created = new Date("2026-10-31T12:00:00Z");
  it("is failed for a reading that has gone on too long, as the job is lost by then", () => {
    expect(shownStatus({ status: "reading", createdAt: created }, new Date(created.getTime() + readingStaleMs))).toBe("reading");
    expect(shownStatus({ status: "reading", createdAt: created }, new Date(created.getTime() + readingStaleMs + 1))).toBe("failed");
    expect(shownStatus({ status: "done", createdAt: created }, new Date(created.getTime() + 10 * readingStaleMs))).toBe("done");
  });

  it("says why a card failed, calmly, with the card kept", () => {
    expect(cardFailureText("ai_unavailable")).toMatch(/ligger kvar/);
    expect(cardFailureText("ai_invalid")).toMatch(/ligger kvar/);
    expect(cardFailureText(null)).toMatch(/försöka igen/);
  });
});

describe("the form", () => {
  it("takes a key, a place and a time with an offset", () => {
    const parsed = thingPhotoFormSchema.parse({ clientKey: uuid, place: uuid, takenAt: "2026-10-31T10:00:00.000Z" });
    expect(parsed.takenAt).toEqual(new Date("2026-10-31T10:00:00.000Z"));
    expect(thingPhotoFormSchema.safeParse({ clientKey: uuid, place: "x", takenAt: "2026-10-31T10:00:00Z" }).success).toBe(false);
    expect(thingPhotoFormSchema.safeParse({ clientKey: uuid, place: uuid, takenAt: "yesterday" }).success).toBe(false);
    expect(thingPhotoFormSchema.safeParse({ clientKey: uuid, place: uuid, takenAt: null }).success).toBe(false);
  });
});

describe("latestCardText", () => {
  it("says the day of the latest card, or that there is none", async () => {
    const { latestCardText } = await import("./thing-photo");
    expect(latestCardText(new Date("2026-10-31T10:00:00Z"))).toBe("Senaste kort 31 okt");
    expect(latestCardText(null)).toBe("Inget kort än");
  });
});
