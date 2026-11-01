import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PantrySite, SelectedSite } from "@/features/pantry";
import { getShoppingList } from "@/features/shopping/server";
import { fail, ok } from "@/lib/errors";
import { ShoppingListContent } from "./shopping-list-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/shopping/server", () => ({ getShoppingList: vi.fn() }));
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/shopping/actions/set-checked", () => ({ setChecked: vi.fn() }));
vi.mock("@/features/shopping/actions/add-custom-item", () => ({ addCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/remove-custom-item", () => ({ removeCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/restore-custom-item", () => ({ restoreCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/save-product-choice", () => ({ saveProductChoice: vi.fn() }));
vi.mock("@/features/shopping/actions/remove-product-choice", () => ({ removeProductChoice: vi.fn() }));
vi.mock("@/features/shopping/actions/restore-product-choice", () => ({ restoreProductChoice: vi.fn() }));
vi.mock("@/features/catalog/server", () => ({ searchIngredients: vi.fn() }));
const putCheckedInPantry = vi.fn();
vi.mock("@/features/shopping/actions/put-checked-in-pantry", () => ({
  putCheckedInPantry: (input: unknown) => putCheckedInPantry(input),
}));
vi.mock("@/features/pantry/actions/select-pantry-site", () => ({ selectPantrySite: vi.fn() }));
const { FakePantryDataError, listPantrySites } = vi.hoisted(() => ({
  FakePantryDataError: class extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
  listPantrySites: vi.fn<() => Promise<PantrySite[]>>(),
}));
vi.mock("@/features/pantry/server", () => ({
  listPantrySites: () => listPantrySites(),
  PantryDataError: FakePantryDataError,
}));

const hemmaSite: PantrySite = { id: "66666666-6666-4666-8666-666666666666", name: "Hemma", isSelected: true };
const stuganSite: PantrySite = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", isSelected: false };

beforeEach(() => {
  listPantrySites.mockReset().mockResolvedValue([hemmaSite, stuganSite]);
});

/** A list with one dish whose needs are all in the pantry, counted against `site`. */
const allInStock = (site: SelectedSite | null) =>
  ok({
    plan: { id: "plan", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
    lines: [],
    hiddenLines: [],
    pantryUnavailable: false,
    checksUnavailable: false,
    pendingClear: 0,
    store: null,
    storeUnavailable: false,
    productChoices: {},
    productChoicesUnavailable: false,
    unreadableChoices: [],
    site,
  });

/** What comes beside the list without a store or a place. */
const noChoices = {
  store: null,
  storeUnavailable: false,
  productChoices: {},
  productChoicesUnavailable: false,
  unreadableChoices: [],
  site: null,
};

describe("ShoppingListContent", () => {
  it("shows shopping_unavailable in a notice when the list cannot be read", async () => {
    vi.mocked(getShoppingList).mockResolvedValue(fail("shopping_unavailable"));
    render(await ShoppingListContent());
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa inköpslistan. Försök igen.");
  });

  it("sends Pontus to the login page, without a notice, when the session has ended", async () => {
    vi.mocked(getShoppingList).mockResolvedValue(fail("unauthorized"));
    await expect(ShoppingListContent()).rejects.toThrow("redirect /logga-in?next=%2Flista");
  });

  it("shows the list", async () => {
    vi.mocked(getShoppingList).mockResolvedValue(
      ok({
        plan: { id: "plan", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
        lines: [],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 1,
        ...noChoices,
      }),
    );
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till vara" })).toBeInTheDocument();
    // Checks an interrupted "Lägg till i Matvaror" left behind keep the button reachable.
    expect(screen.getByRole("button", { name: "Lägg till i Matvaror" })).toBeInTheDocument();
  });

  it("passes the selected store and its product choices on to the line's detail", async () => {
    const graddeId = "11111111-1111-4111-8111-111111111111";
    const store = {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Maxi ICA Stormarknad Östersund",
      chain: "ICA" as const,
      externalStoreId: "1003733",
      address: null,
      url: null,
      offersUrl: null,
      isSelected: true,
    };
    vi.mocked(getShoppingList).mockResolvedValue(
      ok({
        plan: { id: "plan", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
        lines: [
          {
            key: `r:${graddeId}:dl`,
            ingredientId: graddeId,
            label: "Grädde",
            amount: 3,
            unit: "dl" as const,
            isVague: false,
            coverage: { kind: "unlinked" as const },
            section: "Mejeri" as const,
            origins: [],
            checked: false,
            isCustom: false,
          },
        ],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        store,
        storeUnavailable: false,
        productChoices: {
          [graddeId]: {
            id: "33333333-3333-4333-8333-333333333333",
            ingredientId: graddeId,
            storeId: store.id,
            productName: "Arla Matlagningsgrädde 15 %",
            packageSize: "5 dl",
            url: null,
            updatedAt: "2026-10-26T11:23:47.123456+00:00",
          },
        },
        productChoicesUnavailable: false,
        unreadableChoices: [],
        site: null,
      }),
    );
    const user = userEvent.setup();
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    await user.click(screen.getByRole("button", { name: /^Grädde/ }));
    const detail = await screen.findByRole("dialog", { name: "Grädde" });
    expect(detail).toHaveTextContent("Arla Matlagningsgrädde 15 % · 5 dl");
  });

  it("passes the choices that cannot be read on to the line's detail, and shows Kopiera till ICA-varukorgen", async () => {
    const graddeId = "11111111-1111-4111-8111-111111111111";
    vi.mocked(getShoppingList).mockResolvedValue(
      ok({
        plan: { id: "plan", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
        lines: [
          {
            key: `r:${graddeId}:dl`,
            ingredientId: graddeId,
            label: "Grädde",
            amount: 3,
            unit: "dl" as const,
            isVague: false,
            coverage: { kind: "missing" as const },
            section: "Mejeri" as const,
            origins: [],
            checked: false,
            isCustom: false,
          },
        ],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        ...noChoices,
        store: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Maxi ICA Stormarknad Östersund",
          chain: "ICA" as const,
          externalStoreId: "1003733",
          address: null,
          url: null,
          offersUrl: null,
          isSelected: true,
        },
        unreadableChoices: [graddeId],
      }),
    );
    const user = userEvent.setup();
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: "Kopiera till ICA-varukorgen" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Grädde/ }));
    const detail = await screen.findByRole("dialog", { name: "Grädde" });
    expect(detail).toHaveTextContent("Det gick inte att läsa produktvalet.");
  });

  it("passes the list's place on, so Lägg till i Matvaror puts the items there", async () => {
    const graddeId = "11111111-1111-4111-8111-111111111111";
    const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };
    putCheckedInPantry.mockResolvedValue(ok({ added: 1, removed: 0, skipped: 0, siteName: "Stugan" }));
    vi.mocked(getShoppingList).mockResolvedValue(
      ok({
        plan: { id: "44444444-4444-4444-8444-444444444444", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
        lines: [
          {
            key: `r:${graddeId}:dl`,
            ingredientId: graddeId,
            label: "Grädde",
            amount: 3,
            unit: "dl" as const,
            isVague: false,
            coverage: { kind: "missing" as const },
            section: "Mejeri" as const,
            origins: [],
            checked: true,
            isCustom: false,
          },
        ],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        ...noChoices,
        site: stugan,
      }),
    );
    const user = userEvent.setup();
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Lägg till i Matvaror" }));
    expect(putCheckedInPantry).toHaveBeenCalledWith({ planId: "44444444-4444-4444-8444-444444444444", siteId: stugan.id });
    expect(await screen.findByTestId("toast")).toHaveTextContent("Lagt 1 vara i Matvaror för Stugan.");
  });

  it("shows Boende and Byt under the title with more than one place, and names the place when all is in stock", async () => {
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: stuganSite.id, name: "Stugan", siteCount: 2 }));
    const { container } = render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: /^Boende: / })).toHaveAccessibleName("Boende: Stugan");
    expect(screen.getByText("Allt finns i Matvaror för Stugan.")).toBeInTheDocument();
    // The button comes before the week picker and the list (Story 19.2: directly under the title).
    const line = screen.getByRole("button", { name: /^Boende: / });
    const list = screen.getByText("Allt finns i Matvaror för Stugan.");
    expect(container).toContainElement(line);
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no line with one place, and says everything is at home as in 1.0", async () => {
    listPantrySites.mockResolvedValue([hemmaSite]);
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: hemmaSite.id, name: "Hemma", siteCount: 1 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
  });

  it("shows the list without a line when the places cannot be read", async () => {
    listPantrySites.mockRejectedValue(new FakePantryDataError("read_failed"));
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: stuganSite.id, name: "Stugan", siteCount: 2 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt finns i Matvaror för Stugan.")).toBeInTheDocument();
  });

  it("shows the list without a line, and logs only the error's name, when the places fail unexpectedly", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    listPantrySites.mockRejectedValue(new TypeError("Stugan broke"));
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: stuganSite.id, name: "Stugan", siteCount: 2 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt finns i Matvaror för Stugan.")).toBeInTheDocument();
    expect(log).toHaveBeenCalledWith("pantry_sites_unavailable", { reason: "TypeError" });
    log.mockRestore();
  });

  it("does not log a pantry error from the places, which the list has logged already", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    listPantrySites.mockRejectedValue(new FakePantryDataError("read_failed"));
    vi.mocked(getShoppingList).mockResolvedValue(allInStock(null));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("shows the line from the places when the list has no place, so the list can be switched away from it", async () => {
    listPantrySites.mockResolvedValue([
      { ...hemmaSite, isSelected: false },
      { ...stuganSite, isSelected: true },
    ]);
    vi.mocked(getShoppingList).mockResolvedValue(allInStock(null));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: /^Boende: / })).toHaveAccessibleName("Boende: Stugan");
    expect(screen.getByRole("button", { name: /^Boende: / })).toBeInTheDocument();
  });

  it("reads the list first: a session that ended sends Pontus to the login page whatever the places did", async () => {
    listPantrySites.mockRejectedValue(new Error("bug"));
    vi.mocked(getShoppingList).mockResolvedValue(fail("unauthorized"));
    await expect(ShoppingListContent()).rejects.toThrow("redirect /logga-in?next=%2Flista");
  });
});
