import { describe, expect, it } from "vitest";
import { offerSavedText } from "./offer-saved";

describe("offerSavedText", () => {
  it("lists the offers", () => {
    expect(offerSavedText(["falukorv", "ketchup"])).toBe("Sparad från veckans erbjudanden: falukorv, ketchup");
  });
  it("is null without offers", () => {
    expect(offerSavedText([])).toBeNull();
    expect(offerSavedText(undefined)).toBeNull();
  });
});
