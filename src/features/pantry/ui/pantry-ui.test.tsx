import { fireEvent, render as renderElement, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PantryItem } from "../domain/pantry-item";
import { LocationCards } from "./location-cards";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantryList } from "./pantry-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ postAiForm: vi.fn() }));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: vi.fn() }));

/** PantryList opens the sheet Lagervara, so it needs the providers Hemma has. */
const render = (element: ReactElement) =>
  renderElement(
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl">{element}</PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>,
  );

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  ingredientId: `ingredient-${overrides.id}`,
  location: "Kyl",
  amount: null,
  unit: null,
  ...overrides,
});

describe("LocationCards", () => {
  it("shows the three locations with their counts and marks the chosen one", () => {
    render(<LocationCards selected="Frys" counts={{ Kyl: 3, Frys: 1, Skafferi: 0 }} />);
    const nav = screen.getByRole("navigation", { name: "Platser" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Kyl 3 varor", "Frys 1 vara", "Skafferi 0 varor"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/hemma?plats=kyl",
      "/hemma?plats=frys",
      "/hemma?plats=skafferi",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "true", null]);
    expect(links[1]).toHaveClass("border-accent");
    expect(links[0]).toHaveClass("bg-mint", "border-transparent");
    expect(links[1]).toHaveClass("bg-sky");
    expect(links[2]).toHaveClass("bg-sand");
  });
});

describe("PantryList", () => {
  it("shows items with an amount as rows and unlimited items as tags", () => {
    render(
      <PantryList
        location="Kyl"
        items={[
          item({ id: "1", name: "Mjölk", amount: 1, unit: "l" }),
          item({ id: "2", name: "Salt" }),
          item({ id: "3", name: "Smör", amount: 250, unit: "g" }),
        ]}
      />,
    );
    const rows = within(screen.getByRole("list", { name: "Med mängd" })).getAllByTestId("pantry-row");
    expect(rows.map((row) => row.textContent)).toEqual(["Mjölk 1 l", "Smör 250 g"]);
    // Each row has its swipe action, also reached with Tab (Story 2.3); tags are removed in the sheet.
    expect(screen.getAllByRole("button", { name: /^Ta bort / }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "Ta bort Mjölk",
      "Ta bort Smör",
    ]);
    const tags = within(screen.getByRole("list", { name: "Finns hemma" })).getAllByRole("listitem");
    expect(tags.map((tag) => tag.textContent)).toEqual(["Salt"]);
  });

  it("formats amounts with formatQuantity and leaves out an empty section", () => {
    render(<PantryList location="Frys" items={[item({ id: "1", name: "Ärtor", location: "Frys", amount: 0.333, unit: "kg" })]} />);
    expect(screen.getByText("0,33 kg")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Finns hemma" })).toBeNull();
  });

  it("names the location when it is empty and offers to add an item", () => {
    render(<PantryList location="Skafferi" items={[]} />);
    expect(screen.getByText("Inget i skafferiet än.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    expect(screen.getByRole("searchbox", { name: "Sök ingrediens" })).toBeInTheDocument();
  });

  it("opens the sheet for an item on a tap on its row or tag", () => {
    render(
      <PantryList
        location="Kyl"
        items={[item({ id: "1", name: "Mjölk", amount: 1.5, unit: "l" }), item({ id: "2", name: "Salt" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mjölk 1,5 l" }));
    expect(screen.getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Mjölk");
    expect(screen.getByLabelText("Mängd")).toHaveValue("1,5");
    expect(screen.getByLabelText("Enhet")).toHaveValue("l");

    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    fireEvent.click(screen.getByRole("button", { name: "Salt" }));
    expect(screen.getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Salt");
    expect(screen.getByLabelText("Mängd")).toHaveValue("");
  });
});
