import { beforeEach, describe, expect, it } from "vitest";
import { latestNavTiming, navTimingHistory, noteCommitted, noteReady, noteTap, resetNavTiming, timingText } from "./nav-timing-store";

beforeEach(() => resetNavTiming());

describe("a switch of tab", () => {
  it("is timed from the tap to the content, with the frame's time on the way", () => {
    noteTap("/matsedel", "/recept", 1_000);
    noteCommitted("/matsedel", 1_040);
    const result = noteReady("Matsedel", "/matsedel", 1_412);
    expect(result).toEqual({ name: "Matsedel", committedMs: 40, readyMs: 412 });
    expect(timingText(result!)).toBe("Matsedel 412 ms (ramen efter 40 ms)");
    expect(latestNavTiming()).toEqual(result);
  });

  it("says nothing about a page that appears without a tap, and starts nothing for the page one is on", () => {
    expect(noteReady("Recept", "/recept", 5_000)).toBeNull();
    noteTap("/recept", "/recept", 1_000);
    expect(noteReady("Recept", "/recept", 1_100)).toBeNull();
  });

  it("is timed once: a second ready for the same switch is ignored", () => {
    noteTap("/lista", "/recept", 0);
    expect(noteReady("Inköpslista", "/lista", 300)).not.toBeNull();
    expect(noteReady("Inköpslista", "/lista", 600)).toBeNull();
  });

  it("is not timed when the page that is ready is not the one tapped", () => {
    noteTap("/lista", "/recept", 0);
    expect(noteReady("Matsedel", "/matsedel", 200)).toBeNull();
  });

  it("works without the frame's time, and keeps the last twenty", () => {
    noteTap("/hemma", "/recept", 0);
    expect(timingText(noteReady("Matvaror", "/hemma", 90)!)).toBe("Matvaror 90 ms");
    for (let i = 0; i < 25; i += 1) {
      noteTap("/hemma", "/recept", 0);
      noteReady("Matvaror", "/hemma", i);
    }
    expect(navTimingHistory()).toHaveLength(20);
  });
});
