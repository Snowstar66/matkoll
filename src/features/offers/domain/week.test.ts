import { describe, expect, it } from "vitest";
import {
  addDays,
  isIsoDate,
  isoWeekNumber,
  isSavableWeek,
  isWeekOver,
  mondayOf,
  swedishToday,
  weekEnd,
  weekLabel,
  weekOfValidTo,
  weekPillLabel,
  weekShortLabel,
  weekStartOf,
} from "./week";

describe("weekStartOf", () => {
  it("gives the Monday of the week in Swedish time", () => {
    expect(weekStartOf(new Date("2026-10-28T12:00:00+01:00"))).toBe("2026-10-26");
    expect(weekStartOf(new Date("2026-10-26T00:00:00+01:00"))).toBe("2026-10-26");
  });

  it("puts Sunday 23.59 in its own week and Monday 00.00 in the next", () => {
    expect(weekStartOf(new Date("2026-11-01T23:59:00+01:00"))).toBe("2026-10-26");
    expect(weekStartOf(new Date("2026-11-02T00:00:00+01:00"))).toBe("2026-11-02");
  });

  it("counts the day in Swedish time, not UTC: late Sunday evening UTC is Monday in Sweden", () => {
    // 23.30 UTC on Sunday 1 November is 00.30 on Monday in Stockholm.
    expect(swedishToday(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
    expect(weekStartOf(new Date("2026-11-01T23:30:00Z"))).toBe("2026-11-02");
  });

  it("is not moved by summer time", () => {
    // Summer time ended at 03.00 on Sunday 25 October 2026; the night before is still that week.
    expect(weekStartOf(new Date("2026-10-25T01:30:00Z"))).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-25T23:00:00Z"))).toBe("2026-10-26");
    // Summer time began on 29 March 2026: 22.30 UTC on Sunday is 00.30 on Monday.
    expect(weekStartOf(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30");
  });

  it("crosses a new year", () => {
    expect(weekStartOf(new Date("2027-01-01T12:00:00+01:00"))).toBe("2026-12-28");
    expect(mondayOf("2027-01-03")).toBe("2026-12-28");
  });
});

describe("week numbers and labels", () => {
  it("gives ISO week numbers, also week 53 and week 1 across the new year", () => {
    expect(isoWeekNumber("2026-10-26")).toBe(44);
    expect(isoWeekNumber("2026-12-28")).toBe(53);
    expect(isoWeekNumber("2027-01-04")).toBe(1);
    expect(isoWeekNumber("2025-12-29")).toBe(1);
    expect(isoWeekNumber("2020-12-28")).toBe(53);
  });

  it("writes the week with its dates", () => {
    expect(weekLabel("2026-10-26")).toBe("vecka 44, 26 okt–1 nov");
    expect(weekLabel("2026-11-02")).toBe("vecka 45, 2–8 nov");
    expect(weekLabel("2026-12-28")).toBe("vecka 53, 28 dec–3 jan");
    expect(weekPillLabel("2026-11-02")).toBe("Vecka 45");
    expect(weekShortLabel("2026-11-02")).toBe("vecka 45");
  });
});

describe("weekOfValidTo", () => {
  it("takes the week of the most common last day", () => {
    const dates = ["2026-11-01", "2026-11-01", "2026-11-01", "2026-11-22", "2026-11-08", "2026-10-28"];
    expect(weekOfValidTo(dates)).toBe("2026-10-26");
  });

  it("counts days of the same week together", () => {
    expect(weekOfValidTo(["2026-11-01", "2026-10-28", "2026-11-08", "2026-11-08"])).toBe("2026-10-26");
  });

  it("gives a tie to the earliest week, and null without dates", () => {
    expect(weekOfValidTo(["2026-11-08", "2026-11-01"])).toBe("2026-10-26");
    expect(weekOfValidTo([])).toBeNull();
    expect(weekOfValidTo(["inte ett datum", "2026-02-30"])).toBeNull();
  });
});

describe("which weeks can be saved", () => {
  const now = new Date("2026-10-28T12:00:00+01:00");

  it("allows this week and next, nothing else", () => {
    expect(isSavableWeek("2026-10-26", now)).toBe(true);
    expect(isSavableWeek("2026-11-02", now)).toBe(true);
    expect(isSavableWeek("2026-10-19", now)).toBe(false);
    expect(isSavableWeek("2026-11-09", now)).toBe(false);
  });

  it("says a week is over after its Sunday, in Swedish time", () => {
    expect(isWeekOver("2026-10-26", new Date("2026-11-01T23:59:00+01:00"))).toBe(false);
    expect(isWeekOver("2026-10-26", new Date("2026-11-02T00:00:00+01:00"))).toBe(true);
    expect(weekEnd("2026-10-26")).toBe("2026-11-01");
  });

  it("checks dates", () => {
    expect(isIsoDate("2026-11-01")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
