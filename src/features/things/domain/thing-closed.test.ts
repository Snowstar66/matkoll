import { describe, expect, it } from "vitest";
import { closedBoxesText, closedBoxMeta, cropStyle, withoutOwnBox, type ClosedBox } from "./thing-closed";

const box = (name: string, over: Partial<ClosedBox> = {}): ClosedBox => ({
  id: name,
  name,
  whereHint: null,
  cardId: "c1",
  takenAt: "2026-10-31T10:00:00.000Z",
  box: { left: 0.1, top: 0.2, width: 0.2, height: 0.4 },
  photoWidth: 1000,
  photoHeight: 500,
  ...over,
});

describe("closed boxes", () => {
  it("counts them in plain words", () => {
    expect(closedBoxesText(1)).toBe("1 låda där innehållet inte syns");
    expect(closedBoxesText(9)).toBe("9 lådor där innehållet inte syns");
  });

  it("says where a box stands and the day of its card", () => {
    expect(closedBoxMeta(box("Blå back", { whereHint: "översta hyllan" }))).toBe("översta hyllan · Kort från 31 okt");
    expect(closedBoxMeta(box("Blå back"))).toBe("Kort från 31 okt");
  });

  it("leaves out boxes that have a box of their own, and repeats", () => {
    const boxes = [box("Blå back"), box("blå back"), box("Röd låda")];
    expect(withoutOwnBox(boxes, []).map((b) => b.name)).toEqual(["Blå back", "Röd låda"]);
    expect(withoutOwnBox(boxes, ["Blå Back", null]).map((b) => b.name)).toEqual(["Röd låda"]);
  });

  it("crops around the marker, keeping the photo's proportions", () => {
    const crop = cropStyle({ left: 0.1, top: 0.2, width: 0.2, height: 0.4 }, 1000, 500);
    expect(crop).toEqual({ aspect: 1, left: "-50%", top: "-50%", width: "500%", height: "250%" });
    expect(cropStyle({ left: 0, top: 0, width: 0.5, height: 0.5 }, 0, 0).aspect).toBe(1);
  });
});
