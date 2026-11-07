import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { offerTagOf, offerTagText, tagPriceText, uniqueTags } from "@/lib/offer-tag";
import { OfferTag, OfferTags } from "./offer-tag";

const lok = { name: "Gul lök", price: "10 kr/kg" };
const tomater = { name: "Krossade tomater", price: "3 för 2" };
const lax = { name: "Laxfilé", price: "129 kr/kg" };

describe("offer tag text (UX-20)", () => {
  it("writes the short name and the price, without the brand", () => {
    expect(offerTagOf({ label: "Odlarna Gul lök", name: "gul lök", price: "10 kr/kg" })).toEqual(lok);
    expect(offerTagOf({ label: "Bondens Krossade tomater", name: "krossade tomater", price: "Köp 3 betala för 2" })).toEqual(tomater);
    expect(offerTagOf({ label: "Gul lök", name: "", price: null })).toEqual({ name: "Gul lök", price: null });
    expect(tagPriceText("  ")).toBeNull();
  });

  it("says the price only where the name stands beside it, and the name when there is no price", () => {
    expect(offerTagText(lok)).toBe("Gul lök 10 kr/kg");
    expect(offerTagText(lok, true)).toBe("10 kr/kg");
    expect(offerTagText({ name: "Gul lök", price: null }, true)).toBe("Gul lök");
    expect(uniqueTags([lok, lax, lok])).toEqual([lok, lax]);
  });
});

describe("OfferTag and OfferTags", () => {
  it("shows one tag, or only the price", () => {
    const { rerender } = render(<OfferTag tag={lok} />);
    expect(screen.getByTestId("offer-tag")).toHaveTextContent("Gul lök 10 kr/kg");
    rerender(<OfferTag tag={lok} priceOnly />);
    expect(screen.getByTestId("offer-tag")).toHaveTextContent(/^10 kr\/kg$/);
  });

  it("shows at most two tags and then +N", () => {
    render(<OfferTags tags={[lok, tomater, lax]} />);
    const row = screen.getByTestId("offer-tags");
    expect(within(row).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Gul lök 10 kr/kg", "Krossade tomater 3 för 2"]);
    expect(within(row).getByTestId("offer-tags-more")).toHaveTextContent("+1");
  });

  it("keeps the shortest tag where there is room for one, then +N", () => {
    render(<OfferTags tags={[tomater, lax, lok]} max={1} shortest />);
    expect(screen.getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Gul lök 10 kr/kg"]);
    expect(screen.getByTestId("offer-tags-more")).toHaveTextContent("+2");
  });

  it("shows nothing without tags", () => {
    render(<OfferTags tags={[]} />);
    expect(screen.queryByTestId("offer-tags")).not.toBeInTheDocument();
  });
});
