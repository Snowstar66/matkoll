import { describe, expect, it } from "vitest";
import { customLineKey } from "./line-key";
import { isNewLine, lineAddedAtOf, newLineMs } from "./line-news";

const now = "2026-11-04T12:00:00.000Z";
const hoursAgo = (hours: number) => new Date(Date.parse(now) - hours * 60 * 60 * 1000).toISOString();

describe("lineAddedAtOf", () => {
  it("gives an own item its own time and a recipe line its newest dish's", () => {
    const added = lineAddedAtOf(
      [
        { key: customLineKey("c1"), isCustom: true, origins: [] },
        { key: "ing:milk|dl", isCustom: false, origins: ["d1"] },
        { key: "ing:cream|dl", isCustom: false, origins: ["d1", "d2"] },
        { key: "text:salt", isCustom: false, origins: ["d3"] },
      ],
      { d1: hoursAgo(72), d2: hoursAgo(2) },
      [{ id: "c1", at: hoursAgo(5) }],
    );
    expect(added).toEqual({
      [customLineKey("c1")]: hoursAgo(5),
      "ing:milk|dl": hoursAgo(72),
      "ing:cream|dl": hoursAgo(2),
    });
  });
});

describe("isNewLine", () => {
  const line = (key: string, checked = false) => ({ key, checked });

  it("an own item added within 48 h is new", () => {
    const added = lineAddedAtOf([{ key: customLineKey("c1"), isCustom: true, origins: [] }], {}, [{ id: "c1", at: hoursAgo(1) }]);
    expect(isNewLine(line(customLineKey("c1")), added, now)).toBe(true);
  });

  it("a dish's line is new while the dish was added within 48 h, and not after", () => {
    const lines = [{ key: "ing:milk|dl", isCustom: false, origins: ["d1"] }];
    expect(isNewLine(line("ing:milk|dl"), lineAddedAtOf(lines, { d1: hoursAgo(47) }, []), now)).toBe(true);
    expect(isNewLine(line("ing:milk|dl"), lineAddedAtOf(lines, { d1: hoursAgo(49) }, []), now)).toBe(false);
  });

  it("a line from several dishes is new when its newest dish is", () => {
    const lines = [{ key: "ing:cream|dl", isCustom: false, origins: ["old", "new"] }];
    expect(isNewLine(line("ing:cream|dl"), lineAddedAtOf(lines, { old: hoursAgo(100), new: hoursAgo(3) }, []), now)).toBe(true);
    expect(isNewLine(line("ing:cream|dl"), lineAddedAtOf(lines, { old: hoursAgo(100), new: hoursAgo(60) }, []), now)).toBe(false);
  });

  it("a ticked line is never new", () => {
    expect(isNewLine(line("k", true), { k: hoursAgo(1) }, now)).toBe(false);
  });

  it("at exactly 48 h the line is no longer new; a millisecond before it is", () => {
    expect(isNewLine(line("k"), { k: hoursAgo(48) }, now)).toBe(false);
    expect(isNewLine(line("k"), { k: new Date(Date.parse(now) - newLineMs + 1).toISOString() }, now)).toBe(true);
  });

  it("a line without a known time is not new", () => {
    expect(isNewLine(line("k"), {}, now)).toBe(false);
  });
});
