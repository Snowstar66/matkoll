import { describe, expect, it } from "vitest";
import {
  highlightDay,
  planningBarText,
  planningButtonText,
  planningDoneHref,
  planningHref,
  planningTarget,
} from "./planning";

const now = new Date("2026-10-29T10:00:00Z"); // Thursday, week of 2026-10-26

describe("planningTarget", () => {
  it("reads a date in a coming week as its week and weekday", () => {
    expect(planningTarget("2026-11-04", now)).toEqual({ date: "2026-11-04", weekStart: "2026-11-02", weekday: 3 });
  });
  it("accepts a day of this week and refuses past weeks, far weeks and junk", () => {
    expect(planningTarget("2026-10-30", now)?.weekday).toBe(5);
    expect(planningTarget("2026-10-20", now)).toBeNull();
    expect(planningTarget("2027-06-01", now)).toBeNull();
    expect(planningTarget("2026-W45", now)).toBeNull();
    expect(planningTarget("2026-02-30", now)).toBeNull();
    expect(planningTarget(undefined, now)).toBeNull();
  });
});

describe("planning texts and addresses", () => {
  const target = planningTarget("2026-11-04", now)!;
  it("says the day in the bar and on the button", () => {
    expect(planningBarText(target)).toBe("Lägger på onsdag 4 nov");
    expect(planningButtonText(target)).toBe("Lägg på onsdag");
  });
  it("builds the planning address and the way back", () => {
    expect(planningHref("2026-11-02", 3)).toBe("/recept?planera=2026-11-04");
    expect(planningDoneHref(target, now)).toBe("/matsedel?vecka=2026-W45&dag=3");
    expect(planningDoneHref(planningTarget("2026-10-30", now)!, now)).toBe("/matsedel?dag=5");
  });
  it("reads ?dag=", () => {
    expect(highlightDay("3")).toBe(3);
    expect(highlightDay("9")).toBeNull();
    expect(highlightDay(undefined)).toBeNull();
  });
});
