import { describe, expect, it } from "vitest";
import type { Member } from "./member";
import { dayText, doerOf, lastChangeOf, lastChangeText, othersOf, whenText } from "./who";

const member = (userId: string, name: string, color: Member["color"], isMe = false): Member => ({
  userId,
  name,
  email: `${name.toLowerCase()}@example.com`,
  role: "member",
  color,
  joinedAt: "2026-11-01T10:00:00Z",
  named: true,
  isMe,
});

const others = othersOf([member("me", "Pontus", "mint", true), member("m", "Martina", "sky")]);
const now = new Date("2026-11-04T18:00:00Z");

describe("who did what (Story 21.3)", () => {
  it("knows the others by id, never me, and nobody who has left", () => {
    expect(doerOf(others, "m")).toEqual({ name: "Martina", tone: "sky" });
    expect(doerOf(others, "me")).toBeNull();
    expect(doerOf(others, "gone")).toBeNull();
    expect(doerOf(others, null)).toBeNull();
  });

  it("says the time today and the day before, in Swedish time", () => {
    expect(whenText("2026-11-04T16:42:00Z", now)).toBe("17:42");
    expect(whenText("2026-11-03T16:42:00Z", now)).toBe("3 nov");
    expect(dayText("2026-11-04T06:00:00Z", now)).toBe("i dag");
    expect(dayText("2026-11-01T06:00:00Z", now)).toBe("1 nov");
  });

  it("reads the last change from updated_by and updated_at, or from who added the row", () => {
    const added = { user_id: "m", created_at: "2026-11-01T09:00:00Z", updated_by: null, updated_at: null };
    expect(lastChangeOf(others, added)).toEqual({ name: "Martina", tone: "sky", at: "2026-11-01T09:00:00.000Z", added: true });
    const changed = { user_id: "me", created_at: "2026-10-20T09:00:00Z", updated_by: "m", updated_at: "2026-11-01T09:00:00Z" };
    expect(lastChangeText(lastChangeOf(others, changed)!, now)).toBe("Martina ändrade · 1 nov");
    // A row put back as it was added (inherited time) counts as changed; one written as it was added counts as added.
    expect(lastChangeOf(others, { ...changed, created_at: "2026-11-01T09:00:00.000Z" })?.added).toBe(true);
    expect(lastChangeOf(others, { ...changed, created_at: "2026-11-01T08:59:50Z" })?.added).toBe(false);
    // My own change hides an earlier one of Martina's.
    expect(lastChangeOf(others, { ...changed, user_id: "m", updated_by: "me" })).toBeNull();
  });
});
