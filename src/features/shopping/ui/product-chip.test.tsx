import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ProductChoice } from "../domain/product-choice";
import { chipChoice, ProductChip } from "./product-chip";

// Produktetikett (Story 11.4): the selected store's product choice beside a
// list line, cut with "…" on screen.

const choice: ProductChoice = {
  id: "66666666-6666-4666-8666-666666666666",
  ingredientId: "falukorv",
  storeId: "55555555-5555-4555-8555-555555555555",
  productName: "Scan Falukorv 800 g",
  packageSize: "800 g",
  url: null,
  updatedAt: "2026-10-26T05:12:29.123456+00:00",
};

describe("chipChoice", () => {
  it("is the store's choice for the line's catalog ingredient", () => {
    expect(chipChoice({ ingredientId: "falukorv" }, true, { falukorv: choice })).toBe(choice);
  });

  it("is none without a store, without a choice, or for a line without a catalog ingredient", () => {
    expect(chipChoice({ ingredientId: "falukorv" }, false, { falukorv: choice })).toBeNull();
    expect(chipChoice({ ingredientId: "lax" }, true, { falukorv: choice })).toBeNull();
    expect(chipChoice({ ingredientId: undefined }, true, { falukorv: choice })).toBeNull();
  });
});

describe("ProductChip", () => {
  it("shows the whole name, cut on screen only, light blue and at most 40 % of the row", () => {
    render(<ProductChip name="Scan Falukorv 800 g extra lång produktbeskrivning" />);
    const chip = screen.getByTestId("product-chip");
    expect(chip).toHaveTextContent("Scan Falukorv 800 g extra lång produktbeskrivning");
    expect(chip).toHaveClass("truncate", "bg-sky", "text-sky-ink", "text-badge", "rounded-sm", "max-w-[40cqw]");
    // Text, not a control: the choice is changed in the line's detail.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
