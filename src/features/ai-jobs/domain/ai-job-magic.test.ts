import { describe, expect, it } from "vitest";
import { fixedStatusLine, formatElapsed, progressText, statusCycleMs, statusLine, stepAt, typicalSeconds } from "./ai-job-magic";

describe("the status line of the magical view (Story 12.8)", () => {
  it("cycles through the texts of a kind and starts over", () => {
    expect(statusLine("suggest", 0)).toBe("Läser dina matvaror…");
    expect(statusLine("suggest", 3)).toBe("Skriver recepten…");
    expect(statusLine("suggest", 4)).toBe("Läser dina matvaror…");
    expect(statusLine("analyze", 2)).toBe("Räknar antal…");
    expect(statusLine("analyze", 3)).toBe("Tittar på fotot…");
    expect(statusLine("import", 1)).toBe("Läser ingredienserna…");
    expect(statusLine("import", -1)).toBe("Strukturerar stegen…");
  });

  it("changes every 2.5 s and has one fixed text for reduced motion", () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(statusCycleMs - 1)).toBe(0);
    expect(stepAt(statusCycleMs)).toBe(1);
    expect(stepAt(-5)).toBe(0);
    expect(fixedStatusLine("import")).toBe("Hämtar receptet…");
  });

  it("formats the elapsed time and the estimate", () => {
    expect(formatElapsed(12.9)).toBe("12 s");
    expect(formatElapsed(65)).toBe("1 min 5 s");
    expect(formatElapsed(120)).toBe("2 min");
    expect(progressText("suggest", 12)).toBe("12 s av ca 35 s");
    expect(progressText("analyze", 30)).toBe("30 s av ca 30 s");
    expect(progressText("suggest", typicalSeconds.suggest + 1)).toBe("36 s, tar lite längre än vanligt");
  });
});
