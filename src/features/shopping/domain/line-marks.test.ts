import { describe, expect, it } from "vitest";
import { lineMarksOf, markDetailText, markLabel, shownMark } from "./line-marks";

const others = new Map([["m", { name: "Martina", tone: "sky" as const }]]);
const now = new Date("2026-11-04T18:00:00Z");

describe("line marks (Story 21.3)", () => {
  const marks = lineMarksOf(
    [
      { key: "r:mjolk", by: "m", at: "2026-11-04T16:42:00Z" },
      { key: "r:smor", by: "me", at: "2026-11-04T16:43:00Z" },
      { key: "c:citron", by: "me", at: "2026-11-04T16:44:00Z" },
    ],
    [{ key: "c:citron", by: "m", at: "2026-11-04T13:12:00Z" }],
    others,
  );

  it("marks only what someone else did", () => {
    expect(Object.keys(marks).sort()).toEqual(["c:citron", "r:mjolk"]);
    expect(shownMark({ key: "r:smor", checked: true }, marks)).toBeNull();
  });

  it("shows the check while the line is checked, and otherwise who added it", () => {
    const checked = shownMark({ key: "r:mjolk", checked: true }, marks)!;
    expect(markLabel(checked)).toBe("bockad av Martina");
    expect(markDetailText(checked, now)).toBe("Martina bockade av · 17:42");
    // Unchecked here: Martina's check is gone.
    expect(shownMark({ key: "r:mjolk", checked: false }, marks)).toBeNull();
    // I checked Martina's own item: it still says she added it.
    const added = shownMark({ key: "c:citron", checked: true }, marks)!;
    expect(markLabel(added)).toBe("tillagd av Martina");
    expect(markDetailText(added, now)).toBe("Martina lade till · 14:12");
  });
});
