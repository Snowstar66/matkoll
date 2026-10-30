import { describe, expect, it } from "vitest";
import { copiedText, copyTargets, weekTileLabel, weekTileName } from "./week";

describe("week overview helpers", () => {
  it("labels the tiles shortly", () => {
    expect([0, 1, 2, 5].map(weekTileLabel)).toEqual(["Denna vecka", "Nästa", "Om 2 v", "Om 5 v"]);
  });

  it("names a tile for a screen reader", () => {
    expect(weekTileName("2026-11-02", 1, 3)).toBe("Vecka 45, nästa vecka, 3 rätter");
    expect(weekTileName("2026-11-02", 1, 1)).toBe("Vecka 45, nästa vecka, 1 rätt");
    expect(weekTileName("2026-10-26", 0, 0)).toBe("Vecka 44, denna vecka, inga rätter");
  });

  it("offers this week and the next two to copy to", () => {
    const targets = copyTargets(new Date("2026-10-29T10:00:00Z"));
    expect(targets.map((t) => [t.weekStart, t.label])).toEqual([
      ["2026-10-26", "Denna vecka"],
      ["2026-11-02", "Nästa vecka"],
      ["2026-11-09", "Om 2 veckor"],
    ]);
  });

  it("says what was copied", () => {
    expect(copiedText(5, "2026-11-09")).toBe("Kopierade 5 rätter till vecka 46");
    expect(copiedText(1, "2026-11-09")).toBe("Kopierade 1 rätt till vecka 46");
  });
});
