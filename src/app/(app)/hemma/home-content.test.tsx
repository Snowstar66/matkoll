import { render as renderElement, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { CatalogDataError } from "@/features/catalog/server";
import type { PantryItem } from "@/features/pantry";
import { countPantryItems, listPantry, PantryDataError } from "@/features/pantry/server";
import { PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { HomeContent } from "./home-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  countPantryItems: vi.fn(),
  listPantry: vi.fn(),
}));

vi.mock("@/features/pantry/actions/set-pantry-item", () => ({ savePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/search-ingredients", () => ({ searchPantryIngredients: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/pantry/actions/remove-pantry-item", () => ({ removePantryItem: vi.fn() }));
vi.mock("@/features/pantry/actions/restore-pantry-item", () => ({ restorePantryItem: vi.fn() }));

/** The list opens the sheet Lagervara, which the page provides. */
const render = (element: ReactElement) =>
  renderElement(
    <ToastProvider>
      <PantrySheetProvider location="Kyl">{element}</PantrySheetProvider>
    </ToastProvider>,
  );

const unavailable = "Det gick inte att läsa lagret. Försök igen.";
const mjolk: PantryItem = { id: "1", ingredientId: "m", name: "Mjölk", location: "Kyl", amount: 1, unit: "l" };

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  logged.mockRestore();
});

describe("HomeContent", () => {
  it("shows the cards and the list, with the chosen card counting the listed items", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 5, Frys: 1, Skafferi: 0 });
    vi.mocked(listPantry).mockResolvedValue([mjolk]);
    render(await HomeContent({ location: "Kyl", next: "/hemma" }));
    const links = within(screen.getByRole("navigation", { name: "Platser" })).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Kyl 1 vara", "Frys 1 vara", "Skafferi 0 varor"]);
    expect(screen.getByText("Mjölk")).toBeInTheDocument();
    expect(listPantry).toHaveBeenCalledWith("Kyl");
  });

  it("shows a notice when the pantry cannot be read", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new PantryDataError("query_failed 500"));
    render(await HomeContent({ location: "Frys", next: "/hemma?plats=frys" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 500" });
  });

  it("shows a notice when the catalog's names cannot be read, and logs code and detail", async () => {
    vi.mocked(countPantryItems).mockResolvedValue({ Kyl: 0, Frys: 0, Skafferi: 0 });
    vi.mocked(listPantry).mockRejectedValue(new CatalogDataError("query_failed", "57014"));
    render(await HomeContent({ location: "Kyl", next: "/hemma" }));
    expect(screen.getByRole("alert")).toHaveTextContent(unavailable);
    expect(logged).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed", detail: "57014" });
  });

  it("lets other errors through to the error boundary", async () => {
    vi.mocked(countPantryItems).mockRejectedValue(new Error("boom"));
    vi.mocked(listPantry).mockResolvedValue([]);
    await expect(HomeContent({ location: "Kyl", next: "/hemma" })).rejects.toThrow("boom");
  });
});
