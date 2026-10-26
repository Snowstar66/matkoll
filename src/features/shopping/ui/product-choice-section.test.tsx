import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Store } from "@/features/settings";
import type { ProductChoice, ProductChoiceContext } from "../domain/product-choice";
import { ProductChoiceSection } from "./product-choice-section";

// The section Produktval in Listpostdetalj (Story 7.2): the saved choice or
// "Inget produktval i [butik].", the button that asks for the sheet, and the
// variants without a store, without a link and with read errors.

const gradde = "11111111-1111-4111-8111-111111111111";
const maxi: Store = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: null,
  isSelected: true,
};
const choice: ProductChoice = {
  id: "33333333-3333-4333-8333-333333333333",
  ingredientId: gradde,
  storeId: maxi.id,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: "https://www.arla.se/produkter/matlagningsgradde",
  updatedAt: "2026-10-26T11:23:47.123456+00:00",
};
const context = (changes: Partial<ProductChoiceContext> = {}): ProductChoiceContext => ({
  store: maxi,
  storeUnavailable: false,
  productChoices: {},
  productChoicesUnavailable: false,
  unreadableChoices: [],
  ...changes,
});
const recipeLine = { ingredientId: gradde, isCustom: false };

const section = () => screen.getByRole("region", { name: "Produktval" });

describe("ProductChoiceSection", () => {
  it("says there is no choice in the store, with Ange produktval", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<ProductChoiceSection line={recipeLine} context={context()} onOpen={onOpen} />);
    expect(within(section()).getByRole("heading", { level: 3, name: "Produktval" })).toBeInTheDocument();
    expect(section()).toHaveTextContent("Inget produktval i Maxi ICA Stormarknad Östersund.");
    await user.click(within(section()).getByRole("button", { name: "Ange produktval" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("shows the saved choice with its link in a new tab, and Ändra produktval", () => {
    render(<ProductChoiceSection line={recipeLine} context={context({ productChoices: { [gradde]: choice } })} onOpen={vi.fn()} />);
    expect(screen.getByTestId("product-choice-text")).toHaveTextContent("Arla Matlagningsgrädde 15 % · 5 dl");
    const link = screen.getByRole("link", { name: "Öppna produkten Arla Matlagningsgrädde 15 % (öppnas i en ny flik)" });
    expect(link).toHaveTextContent(/^Öppna produkten/);
    expect(link).toHaveAttribute("href", choice.url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: "Ändra produktval" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ange produktval" })).not.toBeInTheDocument();
  });

  it("shows no link for a choice without one", () => {
    render(
      <ProductChoiceSection
        line={recipeLine}
        context={context({ productChoices: { [gradde]: { ...choice, packageSize: null, url: null } } })}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByTestId("product-choice-text")).toHaveTextContent(/^Arla Matlagningsgrädde 15 %$/);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows only the choice for the line's ingredient", () => {
    render(
      <ProductChoiceSection
        line={{ ingredientId: "44444444-4444-4444-8444-444444444444", isCustom: false }}
        context={context({ productChoices: { [gradde]: choice } })}
        onOpen={vi.fn()}
      />,
    );
    expect(section()).toHaveTextContent("Inget produktval i Maxi ICA Stormarknad Östersund.");
  });

  it("explains, without a button, that an own item needs a link to a catalog ingredient", () => {
    render(<ProductChoiceSection line={{ isCustom: true }} context={context()} onOpen={vi.fn()} />);
    expect(screen.getByText("Koppla varan till en ingrediens för att spara ett produktval.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("points to Inställningar without a selected store", () => {
    render(<ProductChoiceSection line={recipeLine} context={context({ store: null })} onOpen={vi.fn()} />);
    expect(section()).toHaveTextContent("Välj en butik i inställningarna för att spara produktval.");
    expect(screen.getByRole("link", { name: "Öppna inställningar" })).toHaveAttribute("href", "/installningar");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so, without a button, when the store cannot be read", () => {
    render(<ProductChoiceSection line={recipeLine} context={context({ store: null, storeUnavailable: true })} onOpen={vi.fn()} />);
    expect(within(section()).getByRole("status")).toHaveTextContent("Det gick inte att läsa butiken. Försök igen.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so, without a button, when the choices cannot be read", () => {
    render(<ProductChoiceSection line={recipeLine} context={context({ productChoicesUnavailable: true })} onOpen={vi.fn()} />);
    expect(within(section()).getByRole("status")).toHaveTextContent("Det gick inte att läsa produktvalen. Försök igen.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("waits with the button while the detail saves", () => {
    render(<ProductChoiceSection line={recipeLine} context={context()} onOpen={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: "Ange produktval" })).toBeDisabled();
  });

  it("says the stored choice cannot be read, without a button, so nothing is saved over it", () => {
    render(
      <ProductChoiceSection
        line={recipeLine}
        context={context({ productChoices: {}, unreadableChoices: [gradde] })}
        onOpen={vi.fn()}
      />,
    );
    expect(within(section()).getByRole("status")).toHaveTextContent("Det gick inte att läsa produktvalet.");
    expect(section()).not.toHaveTextContent("Inget produktval");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("waits with the button, and says why, while an own item has unsaved changes", () => {
    render(<ProductChoiceSection line={{ ingredientId: gradde, isCustom: true }} context={context()} onOpen={vi.fn()} blockedHint="Spara varan först." />);
    const button = screen.getByRole("button", { name: "Ange produktval" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription("Spara varan först.");
  });
});
