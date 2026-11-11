import { describe, expect, it } from "vitest";
import { maxPlaceTextLength, parsePlaceText, roundCoordinates } from "./location";

describe("roundCoordinates", () => {
  it("rounds to 3 decimals", () => {
    expect(roundCoordinates(59.329323, 18.068581)).toEqual({ lat: 59.329, lng: 18.069 });
    expect(roundCoordinates(-0.0004, 0.0005)).toEqual({ lat: 0, lng: 0.001 });
  });
  it("refuses values that are not coordinates", () => {
    expect(roundCoordinates(NaN, 1)).toBeNull();
    expect(roundCoordinates(91, 1)).toBeNull();
    expect(roundCoordinates(1, -181)).toBeNull();
    expect(roundCoordinates("59", "18")).toBeNull();
    expect(roundCoordinates(Infinity, 0)).toBeNull();
    expect(Object.is(roundCoordinates(-0.0001, 0)?.lat, 0)).toBe(true);
  });
});

describe("parsePlaceText", () => {
  it.each([
    ["11122", "postcode", "111 22"],
    ["111 22", "postcode", "111 22"],
    ["  Göteborg ", "city", "Göteborg"],
    ["Östra   Ämtervik", "city", "Östra Ämtervik"],
    ["Sankt-Anna", "city", "Sankt-Anna"],
  ])("accepts %j", (input, kind, text) => {
    expect(parsePlaceText(input)).toEqual({ ok: true, kind, text });
  });
  it("refuses empty, long and odd input", () => {
    expect(parsePlaceText("   ")).toEqual({ ok: false, reason: "empty" });
    expect(parsePlaceText("a".repeat(maxPlaceTextLength + 1))).toEqual({ ok: false, reason: "too_long" });
    for (const bad of ["1234", "123456", "Lund 5", "http://x.se", "<b>", "a;b", "59.3,18.0", 5, null]) {
      expect(parsePlaceText(bad)).toEqual({ ok: false, reason: "invalid" });
    }
  });
});
