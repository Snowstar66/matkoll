import { fireEvent, render as renderElement, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PantryItem } from "../domain/pantry-item";
import { LocationCards } from "./location-cards";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantryList } from "./pantry-list";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

/** The place Hemma shows (Story 8.2). */
const testSite = { id: "55555555-5555-4555-8555-555555555555" };

vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("../actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("../actions/empty-pantry-place", () => ({ emptyPantryPlace: vi.fn() }));
vi.mock("../actions/restore-pantry-removal", () => ({ restorePantryRemoval: vi.fn() }));
vi.mock("../actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));
vi.mock("../actions/confirm-pantry-suggestions", () => ({ confirmPantrySuggestions: vi.fn() }));
vi.mock("../actions/confirm-pantry-inventory", () => ({ confirmPantryInventory: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ postAiForm: vi.fn() }));
vi.mock("@/lib/downscale-image", () => ({ downscaleImage: vi.fn() }));

/** PantryList opens the sheet Lagervara, so it needs the providers Hemma has. */
const render = (element: ReactElement) =>
  renderElement(
    <ToastProvider>
      <PantrySuggestionsProvider>
        <PantrySheetProvider location="Kyl" site={testSite}>{element}</PantrySheetProvider>
      </PantrySuggestionsProvider>
    </ToastProvider>,
  );

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  siteId: testSite.id,
  ingredientId: `ingredient-${overrides.id}`,
  location: "Kyl",
  amount: null,
  unit: null,
  label: null,
  createdAt: "2026-10-20T10:00:00+00:00",
  section: "Mejeri",
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
  // The spec's fridge; times relative to now, so "Tillagd …" holds on any day.
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const kyl = [
    item({ id: "1", name: "Mellanmjölk", label: "Arla laktosfri", amount: 1, unit: "l" }),
    item({ id: "2", name: "Gräddfil", createdAt: daysAgo(6), amount: 3, unit: "dl" }),
    item({ id: "3", name: "Ägg", createdAt: new Date().toISOString(), amount: 6, unit: "st" }),
    item({ id: "4", name: "Kycklingfilé", section: "Kött och fisk", createdAt: daysAgo(1), amount: 500, unit: "g" }),
    item({ id: "5", name: "Senap", section: "Skafferi", label: "Johnny's" }),
  ];
  /** Each category's heading, with its rows' names and the line under each. */
  const categories = () =>
    screen.getAllByTestId("pantry-category").map((category) => [
      within(category).getByRole("heading").textContent,
      within(category)
        .getAllByTestId("pantry-row")
        .map((row) => [...row.children].map((line) => line.textContent).join(" | ")),
    ]);

  it("shows the items under their categories in the store's order, with the brand or the time and no amount", () => {
    render(<PantryList location="Kyl" items={kyl} />);
    expect(categories()).toEqual([
      ["Mejeri & ägg", ["Gräddfil | Tillagd för 6 dagar sedan", "Mellanmjölk | Arla laktosfri", "Ägg | Tillagd idag"]],
      ["Kött, fisk & chark", ["Kycklingfilé | Tillagd igår"]],
      ["Såser & smaksättare", ["Senap | Johnny's"]],
    ]);
    // Headings at level 2 that VoiceOver's rotor finds, with the count read as words.
    const dairy = screen.getByRole("heading", { level: 2, name: "Mejeri & ägg" });
    expect(dairy).toHaveAccessibleDescription("3 varor");
    expect(screen.getByRole("list", { name: "Mejeri & ägg" })).toBeInTheDocument();
    // No amount, unit or "Finns hemma" anywhere.
    expect(screen.queryByText(/\b(1 l|3 dl|6 st|500 g)\b/)).toBeNull();
    expect(screen.queryByText(/Med mängd|Finns hemma/)).toBeNull();
    expect(screen.queryByTestId("pantry-tag")).toBeNull();
    expect(screen.queryByTestId("swipe-row-front")).toBeNull();
  });

  it("names each row by its two lines and gives every row a bin", () => {
    render(<PantryList location="Kyl" items={kyl} />);
    expect(screen.getByRole("button", { name: "Mellanmjölk Arla laktosfri" })).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.getAllByRole("button", { name: /^Ta bort / }).map((bin) => bin.getAttribute("aria-label"))).toEqual([
      "Ta bort Gräddfil",
      "Ta bort Mellanmjölk",
      "Ta bort Ägg",
      "Ta bort Kycklingfilé",
      "Ta bort Senap",
    ]);
  });

  it("puts the line under the name in the bin's name when two rows share a name", () => {
    render(
      <PantryList
        location="Kyl"
        items={[
          item({ id: "1", name: "Mjölk", label: "Arla", amount: 1, unit: "l" }),
          item({ id: "2", name: "Mjölk", label: "Garant", amount: 2, unit: "förp" }),
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "Ta bort Mjölk, Arla" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ta bort Mjölk, Garant" })).toBeInTheDocument();
  });

  it("filters on name and brand as Pontus types, and hides categories without a match", () => {
    render(<PantryList location="Kyl" items={kyl} />);
    const field = screen.getByRole("searchbox", { name: "Sök i kylen" });
    expect(field).toHaveAttribute("placeholder", "Sök i kylen");
    fireEvent.change(field, { target: { value: "mjö" } });
    expect(categories()).toEqual([["Mejeri & ägg", ["Mellanmjölk | Arla laktosfri"]]]);
    expect(screen.getByRole("heading", { name: "Mejeri & ägg" })).toHaveAccessibleDescription("1 vara");
    fireEvent.change(field, { target: { value: "JOHNNY" } });
    expect(categories()).toEqual([["Såser & smaksättare", ["Senap | Johnny's"]]]);
  });

  it("says when nothing matches, and Rensa sökning empties the field and puts focus in it", () => {
    render(<PantryList location="Kyl" items={kyl} />);
    const field = screen.getByRole("searchbox", { name: "Sök i kylen" });
    fireEvent.change(field, { target: { value: "xyz" } });
    expect(screen.getByText("Inget i kylen matchar.")).toBeInTheDocument();
    expect(screen.queryByTestId("pantry-category")).toBeNull();
    const clear = screen.getAllByRole("button", { name: "Rensa sökning" }).find((button) => button.textContent === "Rensa sökning");
    fireEvent.click(clear!);
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(screen.getAllByTestId("pantry-category")).toHaveLength(3);
  });

  it("names the location when it is empty and offers to add an item, without a search field", () => {
    render(<PantryList location="Skafferi" items={[]} />);
    expect(screen.getByText("Inget i skafferiet än.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Lägg till vara" }));
    expect(screen.getByRole("searchbox", { name: "Sök ingrediens" })).toBeInTheDocument();
  });

  it("names the search field after the location", () => {
    render(<PantryList location="Frys" items={[item({ id: "1", name: "Ärtor", location: "Frys", section: "Frys" })]} />);
    expect(screen.getByRole("searchbox", { name: "Sök i frysen" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Frys" })).toBeInTheDocument();
  });

  it("opens the sheet for an item on a tap on its row, where the amount still is", () => {
    render(
      <PantryList
        location="Kyl"
        items={[item({ id: "1", name: "Mjölk", amount: 1.5, unit: "l", label: "Arla" }), item({ id: "2", name: "Salt" })]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mjölk Arla" }));
    expect(screen.getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Mjölk");
    expect(screen.getByLabelText("Mängd")).toHaveValue("1,5");
    expect(screen.getByLabelText("Enhet")).toHaveValue("l");

    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    fireEvent.click(screen.getByRole("button", { name: /^Salt / }));
    expect(screen.getByTestId("pantry-sheet-ingredient")).toHaveTextContent("Salt");
    expect(screen.getByLabelText("Mängd")).toHaveValue("");
  });
});
