import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { Location } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { PantrySheetProvider } from "./pantry-item-sheet";
import { PantryPlace } from "./pantry-place";
import { PantrySearchField } from "./pantry-search";
import { PantrySuggestionsProvider } from "./pantry-suggestions";

// Sök i platsen (Story 11.3): the field, and that the search starts empty on
// another place or location but stays while the page is hidden (Activity).

vi.mock("../actions/set-pantry-item", () => ({ savePantryItem: vi.fn(async () => ({ ok: true, data: { id: "1" } })) }));
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

const hemma = { id: "99999999-9999-4999-8999-999999999999", name: "Hemma", siteCount: 2 };
const stugan = { id: "77777777-7777-4777-8777-777777777777", name: "Stugan", siteCount: 2 };

const item = (id: string, name: string, location: Location, siteId = hemma.id): PantryItem => ({
  id,
  siteId,
  ingredientId: `ingredient-${id}`,
  name,
  location,
  amount: null,
  unit: null,
  label: null,
  createdAt: "2026-10-20T10:00:00+00:00",
  section: "Mejeri",
});
const kyl = [item("1", "Mellanmjölk", "Kyl"), item("2", "Smör", "Kyl")];
const frys = [item("3", "Glass", "Frys")];

function Page({ site = hemma, location = "Kyl", items = kyl }: { site?: typeof hemma; location?: Location; items?: PantryItem[] }) {
  return (
    <PantryPlace site={site} location={location} counts={{ Kyl: 2, Frys: 1, Skafferi: 0 }} items={items} />
  );
}

const providers = (children: ReactNode) => (
  <ToastProvider>
    <PantrySuggestionsProvider>
      <PantrySheetProvider location="Kyl" site={hemma}>
        {children}
      </PantrySheetProvider>
    </PantrySuggestionsProvider>
  </ToastProvider>
);

const field = (name = "Sök i kylen") => screen.getByRole("searchbox", { name });
const rowCount = () => screen.queryAllByTestId("pantry-row").length;

describe("PantrySearchField", () => {
  it("is named after the location, with the same placeholder, and searches without a pause", () => {
    const onQueryChange = vi.fn();
    render(<PantrySearchField location="Skafferi" query="" onQueryChange={onQueryChange} />);
    const input = screen.getByRole("searchbox", { name: "Sök i skafferiet" });
    expect(input).toHaveAttribute("placeholder", "Sök i skafferiet");
    expect(input.className).toContain("text-body");
    fireEvent.change(input, { target: { value: "s" } });
    expect(onQueryChange).toHaveBeenCalledWith("s");
  });
});

describe("the search in Lagersaldo", () => {
  it("starts empty when another location is chosen", () => {
    const { rerender } = render(providers(<Page />));
    fireEvent.change(field(), { target: { value: "mjö" } });
    expect(rowCount()).toBe(1);
    rerender(providers(<Page location="Frys" items={frys} />));
    expect(field("Sök i frysen")).toHaveValue("");
    expect(rowCount()).toBe(1);
    rerender(providers(<Page />));
    expect(field()).toHaveValue("");
    expect(rowCount()).toBe(2);
  });

  it("starts empty when another place is chosen", () => {
    const { rerender } = render(providers(<Page />));
    fireEvent.change(field(), { target: { value: "mjö" } });
    rerender(providers(<Page site={stugan} items={kyl.map((one) => ({ ...one, siteId: stugan.id }))} />));
    expect(field()).toHaveValue("");
    expect(rowCount()).toBe(2);
  });

  it("stays, with its matches, while the page is hidden and shown again (React Activity)", () => {
    const { rerender } = render(providers(<Activity mode="visible"><Page /></Activity>));
    fireEvent.change(field(), { target: { value: "mjö" } });
    rerender(providers(<Activity mode="hidden"><Page /></Activity>));
    rerender(providers(<Activity mode="visible"><Page /></Activity>));
    expect(field()).toHaveValue("mjö");
    expect(rowCount()).toBe(1);
  });

  it("keeps the counts on the location cards for the whole location, and hides Töm kylen while it searches", () => {
    render(providers(<Page />));
    expect(screen.getByRole("button", { name: "Töm kylen" })).toBeInTheDocument();
    fireEvent.change(field(), { target: { value: "mjö" } });
    expect(screen.getByRole("link", { name: /^Kyl/ })).toHaveTextContent("Kyl 2 varor");
    expect(screen.queryByRole("button", { name: "Töm kylen" })).toBeNull();
    fireEvent.change(field(), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Töm kylen" })).toBeInTheDocument();
  });

  it("empties when the location has nothing left, so items that come back all show", () => {
    const { rerender } = render(providers(<Page />));
    fireEvent.change(field(), { target: { value: "mjö" } });
    rerender(providers(<Page items={[]} />));
    expect(screen.getByText("Inget i kylen än.")).toBeInTheDocument();
    rerender(providers(<Page />));
    expect(field()).toHaveValue("");
    expect(rowCount()).toBe(2);
  });

  it("empties when an item is saved from the sheet, so it never hides the item", async () => {
    // Ids the form takes (uuids).
    const saved = kyl.map((one, index) => ({
      ...one,
      id: `${index + 1}1111111-1111-4111-8111-111111111111`,
      ingredientId: `${index + 1}2222222-2222-4222-8222-222222222222`,
    }));
    render(providers(<Page items={saved} />));
    fireEvent.change(field(), { target: { value: "mjö" } });
    fireEvent.click(screen.getByRole("button", { name: /^Mellanmjölk / }));
    fireEvent.change(screen.getByLabelText("Mängd"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Enhet"), { target: { value: "l" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Spara ändringar" })));
    await waitFor(() => expect(field()).toHaveValue(""));
    expect(rowCount()).toBe(2);
  });
});
