import { describe, expect, it } from "vitest";
import { cookableDays, defaultWeekAgentSettings, parseWeekAgentSettings, toStoredSettings } from "./settings";

describe("week agent settings", () => {
  it("has the decided defaults: 7 dinners, use soon and offers on", () => {
    expect(defaultWeekAgentSettings).toEqual({ dinners: 7, budget: "normal", vegetarianDays: [], skipDays: [], leftoverDays: [], quickWeekdays: false, useSoonFirst: true, favourOffers: true, offerStoreIds: [] });
  });

  it("reads nothing, junk and arrays as the defaults", () => {
    for (const raw of [undefined, null, {}, [], "x", 3]) expect(parseWeekAgentSettings(raw)).toEqual(defaultWeekAgentSettings);
  });

  it("keeps each valid field and defaults an invalid one", () => {
    const out = parseWeekAgentSettings({ dinners: 9, budget: "low", vegetarianDays: [3, 3, 1], skipDays: ["x"], quickWeekdays: true, favourOffers: "yes", offerStoreIds: ["not-a-uuid"] });
    expect(out).toMatchObject({ dinners: 7, budget: "low", vegetarianDays: [1, 3], skipDays: [], quickWeekdays: true, favourOffers: true, offerStoreIds: [] });
    expect(parseWeekAgentSettings({ dinners: 3 }).dinners).toBe(3);
    expect(parseWeekAgentSettings({ dinners: 2 }).dinners).toBe(7);
    expect(parseWeekAgentSettings({ dinners: 4.5 }).dinners).toBe(7);
  });

  it("gives a weekday one role: skip, then leftover, then vegetarian", () => {
    const out = parseWeekAgentSettings({ skipDays: [6], leftoverDays: [6, 5], vegetarianDays: [5, 6, 4] });
    expect(out).toMatchObject({ skipDays: [6], leftoverDays: [5], vegetarianDays: [4] });
  });

  it("refuses unknown keys and bad values when saving", () => {
    expect(() => toStoredSettings({ ...defaultWeekAgentSettings, dinners: 8 })).toThrow();
    expect(() => toStoredSettings({ ...defaultWeekAgentSettings, extra: 1 } as never)).toThrow();
    expect(toStoredSettings({ ...defaultWeekAgentSettings, skipDays: [2, 2] }).skipDays).toEqual([2]);
  });

  it("lists the days a household can cook on", () => {
    expect(cookableDays({ ...defaultWeekAgentSettings, skipDays: [6], leftoverDays: [7] })).toEqual([1, 2, 3, 4, 5]);
  });
});
