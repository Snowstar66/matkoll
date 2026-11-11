import { describe, expect, it } from "vitest";
import { draftFreshness, draftToShow } from "./draft-age";

const now = new Date("2026-11-12T12:00:00Z");
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe("draftFreshness", () => {
  it("is fresh just under 24 hours and old just over", () => {
    expect(draftFreshness(ago(23 * 60 + 59), now)).toBe("fresh");
    expect(draftFreshness(ago(24 * 60), now)).toBe("old");
    expect(draftFreshness(ago(24 * 60 + 1), now)).toBe("old");
  });
  it("is fresh when made a moment ago, and for a small clock difference", () => {
    expect(draftFreshness(ago(0), now)).toBe("fresh");
    expect(draftFreshness(ago(-0.5), now)).toBe("fresh");
  });
  it("is old for a time far in the future or one that cannot be read", () => {
    expect(draftFreshness(ago(-60), now)).toBe("old");
    expect(draftFreshness("inte en tid", now)).toBe("old");
  });
});

describe("draftToShow (the proposal page)", () => {
  const fresh = { id: "a", createdAt: ago(60) };
  const old = { id: "b", createdAt: ago(25 * 60) };
  const plain = { redo: false, fresh: false };
  it("shows a fresh draft and never an old one", () => {
    expect(draftToShow(fresh, now, plain)).toBe(fresh);
    expect(draftToShow(old, now, plain)).toBeNull();
    expect(draftToShow(null, now, plain)).toBeNull();
  });
  it("ignores even a fresh draft when a redo or a new proposal is asked for", () => {
    expect(draftToShow(fresh, now, { redo: true, fresh: false })).toBeNull();
    expect(draftToShow(fresh, now, { redo: false, fresh: true })).toBeNull();
  });
});
