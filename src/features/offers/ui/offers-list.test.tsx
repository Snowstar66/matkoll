import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StoreOffer } from "../domain/offer";
import { OffersList } from "./offers-list";

function offer(id: string, changes: Partial<StoreOffer>): StoreOffer {
  return {
    id,
    storeId: "s",
    weekStart: "2026-10-26",
    label: "Havets Laxfilé",
    name: "laxfilé",
    ingredientId: null,
    section: "Kött och fisk",
    price: "129 kr/kg",
    note: null,
    memberOnly: false,
    validTo: "2026-11-01",
    source: "link",
    createdAt: "2026-10-28T06:12:00Z",
    ...changes,
  };
}

describe("OffersList", () => {
  it("groups the offers under category headings with their count, as lists named by the heading", () => {
    render(
      <OffersList
        weekStart="2026-10-26"
        offers={[
          offer("1", { label: "Mejerigården Mellanmjölk", name: "mellanmjölk", section: "Mejeri", price: "2 för 30 kr" }),
          offer("2", {}),
          offer("3", { label: "Bondens Krossade tomater", name: "krossade tomater", section: "Skafferi", price: "Köp 3 betala för 2" }),
        ]}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual(["Mejeri & ägg", "Kött, fisk & chark", "Skafferi"]);
    const pantry = screen.getByRole("list", { name: "Skafferi" });
    expect(within(pantry).getByText("Bondens Krossade tomater")).toBeInTheDocument();
    expect(within(pantry).getByText("Köp 3 betala för 2")).toBeInTheDocument();
    expect(screen.getAllByTestId("offer-row")).toHaveLength(3);
  });

  it("wraps a label of 120 characters instead of cutting it", () => {
    const label = `Havets ${"Laxfilé ".repeat(14)}`.trim().slice(0, 120);
    render(<OffersList weekStart="2026-10-26" offers={[offer("1", { label })]} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
