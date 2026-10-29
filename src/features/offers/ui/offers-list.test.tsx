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
    regularPrice: null,
    savingPercent: null,
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

describe("OffersList, how good the offers are (Story 9.11)", () => {
  const offers = [
    offer("1", { label: "Odlarna Gul lök", price: "10 kr/kg" }),
    offer("2", { label: "Gårdens Herrgård", price: "89 kr/kg", regularPrice: 111.9, savingPercent: 20 }),
    offer("3", { label: "Bondens Krossade tomater", price: "Köp 3 betala för 2", savingPercent: 33 }),
  ];

  it("shows the regular price and the saving, and nothing when unknown", () => {
    render(<OffersList weekStart="2026-10-26" offers={offers} />);
    expect(screen.getByText("89 kr/kg · Ord. 111,90 kr · spara 20 %")).toBeInTheDocument();
    expect(screen.getByText("Köp 3 betala för 2 · spara 33 %")).toBeInTheDocument();
    expect(screen.getByText("10 kr/kg")).toBeInTheDocument();
  });

  it("marks 30 % or more as Toppklipp", () => {
    render(<OffersList weekStart="2026-10-26" offers={offers} />);
    expect(screen.getAllByText("Toppklipp")).toHaveLength(1);
  });

  it("lists the best saving first and unknown last", () => {
    render(<OffersList weekStart="2026-10-26" offers={offers} sort="saving" />);
    const rows = screen.getAllByTestId("offer-row").map((row) => row.textContent ?? "");
    expect(rows[0]).toContain("Bondens Krossade tomater");
    expect(rows[1]).toContain("Gårdens Herrgård");
    expect(rows[2]).toContain("Odlarna Gul lök");
    expect(screen.getByRole("list", { name: "Bäst rabatt först" })).toBeInTheDocument();
  });
});
