import { describe, expect, it } from "vitest";
import { seenOnText } from "./thing-merge";
import { thingMeta } from "./thing";

describe("seenOnText", () => {
  it("says nothing for a thing on one card and how many cards otherwise", () => {
    expect(seenOnText(1)).toBeNull();
    expect(seenOnText(2)).toBe("syns på 2 kort");
    expect(seenOnText(3)).toBe("syns på 3 kort");
  });

  it("ends the line under a thing's name", () => {
    expect(thingMeta({ confidence: "low", whereHint: "på väggen", seenOn: 2 })).toBe("kanske · på väggen · syns på 2 kort");
    expect(thingMeta({ confidence: "high", whereHint: null, seenOn: 1 })).toBe("");
    expect(thingMeta({ confidence: "high", whereHint: "golvet" })).toBe("golvet");
  });
});
