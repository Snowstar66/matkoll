import { describe, expect, it } from "vitest";
import { distanceMetres, placeKindOf } from "./place-kinds";

describe("placeKindOf", () => {
  it("maps Google primary types to our kinds", () => {
    expect(placeKindOf("pizza_restaurant")).toBe("pizza");
    expect(placeKindOf("japanese_restaurant")).toBe("sushi");
    expect(placeKindOf("thai_restaurant")).toBe("asiatiskt");
    expect(placeKindOf("swedish_restaurant")).toBe("husmanskost");
    expect(placeKindOf("coffee_shop")).toBe("cafe");
    expect(placeKindOf("pub")).toBe("bar");
  });
  it("falls back to restaurant for an unknown restaurant type or none, other for the rest", () => {
    expect(placeKindOf("ethiopian_restaurant")).toBe("restaurant");
    expect(placeKindOf(null)).toBe("restaurant");
    expect(placeKindOf("gas_station")).toBe("other");
  });
});

describe("distanceMetres", () => {
  it("is about 111 km per degree of latitude and zero for the same point", () => {
    expect(distanceMetres({ lat: 59, lng: 18 }, { lat: 59, lng: 18 })).toBe(0);
    expect(Math.abs(distanceMetres({ lat: 59, lng: 18 }, { lat: 60, lng: 18 }) - 111_195)).toBeLessThan(200);
  });
});
