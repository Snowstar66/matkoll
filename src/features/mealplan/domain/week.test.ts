import { describe, expect, it } from "vitest";
import {
  addWeeks,
  currentWeekStart,
  maxWeeksAhead,
  parseWeekParam,
  viewedWeek,
  weekChoices,
  weekName,
  weekOffsetLabel,
  weekParam,
  weekQuery,
  weeksBetween,
  weekStartOf,
} from "./week";

const thursday = new Date("2026-10-29T10:00:00Z");

describe("weeks (Story 13.7)", () => {
  it("finds the Monday of a Stockholm week, also around midnight and the clock change", () => {
    expect(currentWeekStart(thursday)).toBe("2026-10-26");
    // Sunday 25 October 2026 23:30 in Stockholm (the clock went back that night) is still the week of 19 October.
    expect(weekStartOf(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
    expect(weekStartOf(new Date("2026-12-31T12:00:00Z"))).toBe("2026-12-28");
  });

  it("adds weeks across the year and the clock change", () => {
    expect(addWeeks("2026-10-26", 1)).toBe("2026-11-02");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-10-26", -1)).toBe("2026-10-19");
    expect(weeksBetween("2026-10-26", "2026-11-16")).toBe(3);
    expect(weeksBetween("2026-10-26", "2026-10-12")).toBe(-2);
  });

  it("names and labels weeks", () => {
    expect(weekName("2026-10-26")).toBe("Vecka 44");
    expect(weekName("2026-12-28")).toBe("Vecka 53");
    expect(weekName("2027-01-04")).toBe("Vecka 1");
    expect([0, 1, 2, 5].map(weekOffsetLabel)).toEqual(["Denna vecka", "Nästa vecka", "Om 2 veckor", "Om 5 veckor"]);
    const choices = weekChoices(thursday);
    expect(choices).toHaveLength(maxWeeksAhead + 1);
    expect(choices.slice(0, 2).map(({ name, label }) => `${name} ${label}`)).toEqual([
      "Vecka 44 Denna vecka",
      "Vecka 45 Nästa vecka",
    ]);
    expect(choices.length).toBeGreaterThanOrEqual(9);
  });

  it("writes and reads ?vecka= as a week or a date", () => {
    expect(weekParam("2026-11-02")).toBe("2026-W45");
    expect(weekParam("2027-01-04")).toBe("2027-W01");
    expect(parseWeekParam("2026-W45")).toBe("2026-11-02");
    expect(parseWeekParam("2027-W01")).toBe("2027-01-04");
    expect(parseWeekParam("2026-W53")).toBe("2026-12-28");
    expect(parseWeekParam("2026-11-04")).toBe("2026-11-02");
    for (const bad of ["2026-W54", "2026-W00", "2026-W99", "2026-13-40", "vecka", "", null, undefined, "2027-W53"]) {
      expect(parseWeekParam(bad), String(bad)).toBeNull();
    }
  });

  it("shows this week for a value that is missing, in the past or too far ahead", () => {
    expect(viewedWeek(undefined, thursday)).toBe("2026-10-26");
    expect(viewedWeek("2026-W45", thursday)).toBe("2026-11-02");
    expect(viewedWeek("2026-W43", thursday)).toBe("2026-10-26");
    expect(viewedWeek("2027-W20", thursday)).toBe("2026-10-26");
    expect(viewedWeek(weekParam(addWeeks("2026-10-26", maxWeeksAhead)), thursday)).toBe(addWeeks("2026-10-26", maxWeeksAhead));
  });

  it("leaves the address plain for this week", () => {
    expect(weekQuery("2026-10-26", thursday)).toBe("");
    expect(weekQuery("2026-11-02", thursday)).toBe("?vecka=2026-W45");
  });
});
