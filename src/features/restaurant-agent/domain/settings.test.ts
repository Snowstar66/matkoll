import { describe, expect, it } from "vitest";
import { parseRestaurantSettings, restaurantSettingsSchema } from "./settings";
import { defaultRestaurantSettings } from "./types";

describe("parseRestaurantSettings", () => {
  it("gives the defaults for nothing or junk", () => {
    expect(parseRestaurantSettings(undefined)).toEqual(defaultRestaurantSettings);
    expect(parseRestaurantSettings("x")).toEqual(defaultRestaurantSettings);
    expect(parseRestaurantSettings({ radiusM: 777, when: "never", party: 99 })).toEqual(defaultRestaurantSettings);
  });
  it("keeps valid fields, drops unknown and duplicate picks and caps the lists", () => {
    expect(parseRestaurantSettings({ radiusM: 2000, when: "lunch", party: 4, cuisines: ["pizza", "pizza", "nope", "sushi", "fisk", "indiskt"], priorities: ["kids", "x"] })).toEqual({
      radiusM: 2000,
      when: "lunch",
      party: 4,
      cuisines: ["pizza", "sushi", "fisk"],
      priorities: ["kids"],
    });
  });
  it("has a strict schema for what a phone sends", () => {
    expect(restaurantSettingsSchema.safeParse({ radiusM: 1000, when: "evening", party: 2, cuisines: [], priorities: [] }).success).toBe(true);
    expect(restaurantSettingsSchema.safeParse({ radiusM: 1000, when: "evening", party: 0, cuisines: [], priorities: [] }).success).toBe(false);
    expect(restaurantSettingsSchema.safeParse({ radiusM: 1000, when: "evening", party: 2, cuisines: ["a"], priorities: [] }).success).toBe(false);
  });
  it("does not share the default's arrays", () => {
    const parsed = parseRestaurantSettings({});
    parsed.cuisines.push("pizza");
    expect(defaultRestaurantSettings.cuisines).toEqual([]);
  });
});
