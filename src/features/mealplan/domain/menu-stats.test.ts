import { describe, expect, it } from "vitest";
import { lastPlannedText, menuChip, menuFacts, menuStatsOf, type MenuHistoryRow, usualDayText, weeksOnText } from "./menu-stats";

const thisWeek = "2026-11-16";
const week = (back: number) => {
  const date = new Date(`${thisWeek}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - back * 7);
  return date.toISOString().slice(0, 10);
};
const row = (recipeId: string, back: number, weekday: number | null = 4): MenuHistoryRow => ({ recipeId, weekStart: week(back), weekday });

// A household that has planned for 14 weeks with something every week, so its history is long enough.
const history: MenuHistoryRow[] = [row("filler", 13), row("filler", 0)];

describe("menuStatsOf", () => {
  it("counts the weeks of history from the first planned dish to this week", () => {
    expect(menuStatsOf(history, ["filler"], thisWeek).get("filler")?.historyWeeks).toBe(14);
    expect(menuStatsOf([], ["x"], thisWeek).get("x")).toMatchObject({ historyWeeks: 0, plannedEver: false, lastWeekStart: null });
  });

  it("finds the last planned week, the weeks on the menu in the last 12, and the weekday that stands out", () => {
    const rows = [...history, row("a", 9, 4), row("a", 10, 4), row("a", 20, 4), row("a", 30, 2)];
    const stats = menuStatsOf(rows, ["a"], thisWeek).get("a")!;
    expect(stats.lastWeekStart).toBe(week(9));
    expect(stats.weeksOn).toBe(2); // 9 and 10 weeks ago; 20 and 30 are outside the 12
    expect(stats.usualWeekday).toBe(4);
    expect(stats.plannedEver).toBe(true);
  });

  it("has no usual weekday when none stands out, or with a single planning", () => {
    const spread = menuStatsOf([row("a", 1, 1), row("a", 2, 2), row("a", 3, 3)], ["a"], thisWeek).get("a")!;
    expect(spread.usualWeekday).toBeNull();
    expect(menuStatsOf([row("a", 1, 4)], ["a"], thisWeek).get("a")!.usualWeekday).toBeNull();
  });

  it("does not count a dish planned only ahead as having been on the menu, but it is planned", () => {
    const stats = menuStatsOf([...history, { recipeId: "a", weekStart: "2026-12-07", weekday: 2 }], ["a"], thisWeek).get("a")!;
    expect(stats).toMatchObject({ lastWeekStart: null, weeksOn: 0, plannedEver: true });
  });

  it("counts this week as on the menu", () => {
    expect(menuStatsOf([...history, row("a", 0)], ["a"], thisWeek).get("a")).toMatchObject({ lastWeekStart: thisWeek, weeksOn: 1 });
  });
});

describe("texts", () => {
  it("words the facts", () => {
    expect(lastPlannedText(0, thisWeek)).toBe("Senast denna vecka");
    expect(lastPlannedText(1, week(1))).toBe("Senast förra veckan");
    expect(lastPlannedText(9, "2026-09-14")).toBe("Senast för 9 veckor sedan (v. 38)");
    expect(weeksOnText(4)).toBe("På menyn 4 av de senaste 12 veckorna");
    expect(usualDayText(4)).toBe("Oftast torsdagar");
  });
});

describe("menuFacts and menuChip", () => {
  const stats = (rows: MenuHistoryRow[], id = "a") => menuStatsOf(rows, [id], thisWeek).get(id)!;

  it("show nothing with less than six weeks of history", () => {
    const short = stats([row("filler", 3), row("a", 2)]);
    expect(menuFacts(short, thisWeek)).toBeNull();
    expect(menuChip(short, { longAgoWeeks: 4, thisWeek })).toBeNull();
  });

  it("say Aldrig planerad for a dish never planned, unless the recipe is new", () => {
    const never = stats(history);
    expect(menuFacts(never, thisWeek)).toEqual(["Aldrig planerad"]);
    expect(menuChip(never, { longAgoWeeks: 4, thisWeek })).toBe("Aldrig planerad");
    expect(menuChip(never, { longAgoWeeks: 4, isNew: true, thisWeek })).toBeNull();
  });

  it("have the chip only from the chosen number of weeks, with the real number in it", () => {
    const old = stats([...history, row("a", 9), row("a", 10)]);
    expect(menuChip(old, { longAgoWeeks: 4, thisWeek })).toBe("Inte på menyn 9 veckor");
    expect(menuChip(old, { longAgoWeeks: 12, thisWeek })).toBeNull();
    expect(menuChip(stats([...history, row("a", 3)]), { longAgoWeeks: 4, thisWeek })).toBeNull();
  });

  it("list the facts of a dish that has been on the menu", () => {
    const facts = menuFacts(stats([...history, row("a", 9, 4), row("a", 10, 4)]), thisWeek);
    expect(facts).toEqual([lastPlannedText(9, week(9)), "På menyn 2 av de senaste 12 veckorna", "Oftast torsdagar"]);
  });
});
