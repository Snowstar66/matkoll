import { describe, expect, it } from "vitest";
import { costRowTitle, formatMonthCost, stockholmMonth, usageCostSek } from "./ai-usage";

describe("usageCostSek", () => {
  it("prices tokens per model from the price table", () => {
    // Haiku: 1M in at $0.10 and 1M out at $0.50 is $0.60, 6 kr.
    expect(usageCostSek([{ model: "claude-haiku-5-5", calls: 3, inputTokens: 1_000_000, outputTokens: 1_000_000 }])).toBeCloseTo(6);
    // Sonnet $2/$10 and Opus $4/$20: 100k in and 10k out.
    expect(usageCostSek([{ model: "claude-sonnet-5-5", calls: 1, inputTokens: 100_000, outputTokens: 10_000 }])).toBeCloseTo(3);
    expect(usageCostSek([{ model: "claude-opus-5-5", calls: 1, inputTokens: 100_000, outputTokens: 10_000 }])).toBeCloseTo(6);
  });

  it("adds the models and counts local models and the mock as 0 kr", () => {
    const models = [
      { model: "claude-haiku-5-5", calls: 1, inputTokens: 10_000, outputTokens: 3_000 },
      { model: "qwen/qwen3.6-35b-a3b", calls: 5, inputTokens: 9_999_999, outputTokens: 9_999_999 },
      { model: "mock", calls: 2, inputTokens: 0, outputTokens: 0 },
    ];
    expect(usageCostSek(models)).toBeCloseTo(0.025);
    expect(usageCostSek([])).toBe(0);
  });
});

describe("formatMonthCost", () => {
  it("writes kronor with two decimals and a decimal comma", () => {
    expect(formatMonthCost(1.2)).toBe("ca 1,20 kr");
    expect(formatMonthCost(0.025)).toBe("ca 0,03 kr");
    expect(formatMonthCost(12.345)).toBe("ca 12,35 kr");
    expect(formatMonthCost(1234.5)).toBe("ca 1 234,50 kr");
  });

  it("says 0 kr for nothing and never less than a few öre for something", () => {
    expect(formatMonthCost(0)).toBe("0 kr");
    expect(formatMonthCost(0.0004)).toBe("ca 0,01 kr");
  });

  it("names the row after the month", () => {
    expect(costRowTitle("oktober")).toBe("Kostnad i oktober");
  });
});

describe("stockholmMonth", () => {
  const iso = (date: Date) => date.toISOString();

  it("is the calendar month on Stockholm's clock, in winter time", () => {
    const month = stockholmMonth(new Date("2026-01-15T12:00:00Z"));
    expect(month.monthName).toBe("januari");
    expect(iso(month.from)).toBe("2025-12-31T23:00:00.000Z");
    expect(iso(month.to)).toBe("2026-01-31T23:00:00.000Z");
  });

  it("is the calendar month in summer time, and across the change to winter time", () => {
    const month = stockholmMonth(new Date("2026-10-31T12:00:00Z"));
    expect(month.monthName).toBe("oktober");
    // 1 October is CEST (+2); 1 November is CET (+1).
    expect(iso(month.from)).toBe("2026-09-30T22:00:00.000Z");
    expect(iso(month.to)).toBe("2026-10-31T23:00:00.000Z");
  });

  it("puts the last evening of a month in UTC into the next month in Stockholm", () => {
    // 31 Oct 23:30 UTC is 1 Nov 00:30 in Stockholm.
    const month = stockholmMonth(new Date("2026-10-31T23:30:00Z"));
    expect(month.monthName).toBe("november");
    expect(iso(month.from)).toBe("2026-10-31T23:00:00.000Z");
    expect(iso(month.to)).toBe("2026-11-30T23:00:00.000Z");
  });

  it("counts the exact start of the month as in it and the instant before as the month before", () => {
    expect(stockholmMonth(new Date("2026-04-30T22:00:00Z")).monthName).toBe("maj");
    expect(stockholmMonth(new Date("2026-04-30T21:59:59Z")).monthName).toBe("april");
  });

  it("rolls December over to January of the next year", () => {
    const month = stockholmMonth(new Date("2026-12-10T12:00:00Z"));
    expect(iso(month.to)).toBe("2026-12-31T23:00:00.000Z");
  });
});
