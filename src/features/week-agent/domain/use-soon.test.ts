import { describe, expect, it } from "vitest";
import { useSoonReason } from "./reasons";
import { addDays, soonFactsOf } from "./use-soon";

// Monday 2026-11-16 starts the week; "today" is Wednesday the 18th.
const weekStart = "2026-11-16";
const today = "2026-11-18";
const item = (name: string, expiresOn: string, overdue = false) => ({ ingredientId: name, name, expiresOn, overdue });

describe("soonFactsOf", () => {
  it("gives the weekday of the estimated last day when it falls in the week, marked estimated", () => {
    const facts = soonFactsOf([item("Grädde", "2026-11-20"), item("Kyckling", "2026-11-22")], weekStart, today);
    expect(facts.get("Grädde")).toEqual({ name: "Grädde", expiresWeekday: 5, estimated: true });
    expect(facts.get("Kyckling")).toEqual({ name: "Kyckling", expiresWeekday: 7, estimated: true });
  });

  it("marks what is due today, and has no day for what is overdue", () => {
    const facts = soonFactsOf([item("Mjölk", "2026-11-18"), item("Lime", "2026-11-10", true)], weekStart, today);
    expect(facts.get("Mjölk")).toEqual({ name: "Mjölk", expiresWeekday: 3, estimated: true, today: true });
    expect(facts.get("Lime")).toEqual({ name: "Lime", expiresWeekday: null });
  });

  it("claims nothing for a day outside the week", () => {
    const facts = soonFactsOf([item("Ost", "2026-11-14"), item("Fisk", "2026-11-23")], weekStart, today);
    expect(facts.size).toBe(0);
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-11-28", 6)).toBe("2026-12-04");
  });
});

describe("useSoonReason", () => {
  it("words an estimate as an estimate", () => {
    expect(useSoonReason({ name: "grädde", expiresWeekday: 5, estimated: true })).toBe("Grädde håller till ca fredag");
    expect(useSoonReason({ name: "mjölk", expiresWeekday: 3, estimated: true, today: true })).toBe("Mjölk bör ätas idag");
  });
  it("says Går ut only for a date that is known", () => {
    expect(useSoonReason({ name: "grädde", expiresWeekday: 5 })).toBe("Grädde går ut fredag");
    expect(useSoonReason({ name: "mjölk", expiresWeekday: 3, today: true })).toBe("Mjölk går ut idag");
  });
  it("has no day for what is already old", () => {
    expect(useSoonReason({ name: "lime", expiresWeekday: null })).toBe("Lime behöver användas snart");
  });
});
