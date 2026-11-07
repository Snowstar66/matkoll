import { describe, expect, it } from "vitest";
import { splitOfferNote } from "./offer-note";

describe("splitOfferNote (UX-20)", () => {
  it("splits an offer item into its name and price", () => {
    expect(splitOfferNote("Havregryn (Erbjudande: 89 kr/kg)")).toEqual({ name: "Havregryn", price: "89 kr/kg" });
    expect(splitOfferNote("Gul lök (Erbjudande Maxi: 10 kr/kg)")).toEqual({ name: "Gul lök", price: "10 kr/kg" });
  });

  it("leaves every other label alone", () => {
    expect(splitOfferNote("Gul lök (Erbjudande)")).toBeNull();
    expect(splitOfferNote("Mjölk (från mormor)")).toBeNull();
    expect(splitOfferNote("Mjölk")).toBeNull();
    expect(splitOfferNote("(Erbjudande: 5 kr)")).toBeNull();
  });
});
