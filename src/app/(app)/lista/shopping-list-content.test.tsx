import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { PantrySite, SelectedSite } from "@/features/pantry";
import type { ShoppingLine } from "@/features/shopping";
import { getShoppingList } from "@/features/shopping/server";
import { fail, ok } from "@/lib/errors";
import { ShoppingListContent } from "./shopping-list-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/shopping/server", () => ({ getShoppingList: vi.fn() }));
const getActiveOffers = vi.hoisted(() => vi.fn(async (_storeId: string): Promise<unknown[]> => []));
vi.mock("@/features/offers/server", () => ({
  getActiveOffers,
  OffersDataError: class OffersDataError extends Error {
    detail = "x";
  },
}));
const redirect = vi.fn((url: string) => {
  throw new Error(`redirect ${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const weekCounts = vi.hoisted(() => vi.fn(async (_weeks: readonly string[]): Promise<Record<string, number>> => ({})));
vi.mock("@/features/mealplan/server", async () => {
  const { viewedWeek } = await import("@/features/mealplan");
  return {
    resolveViewedWeek: async (vecka: string | null | undefined, now?: Date) => viewedWeek(vecka, now),
    getWeekCounts: weekCounts,
  };
});
vi.mock("@/features/shopping/actions/set-checked", () => ({ setChecked: vi.fn() }));
vi.mock("@/features/shopping/actions/add-custom-item", () => ({ addCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/remove-custom-item", () => ({ removeCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/restore-custom-item", () => ({ restoreCustomItem: vi.fn() }));
vi.mock("@/features/shopping/actions/save-product-choice", () => ({ saveProductChoice: vi.fn() }));
vi.mock("@/features/shopping/actions/remove-product-choice", () => ({ removeProductChoice: vi.fn() }));
vi.mock("@/features/shopping/actions/restore-product-choice", () => ({ restoreProductChoice: vi.fn() }));
vi.mock("@/features/catalog/server", () => ({ searchIngredients: vi.fn(), matchIngredientNames: vi.fn() }));
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
  beforeEach(() => {
    weekCounts.mockReset();
    weekCounts.mockResolvedValue({});
  });

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
    expect(screen.getByText("Allt till veckans rätter finns redan hemma.")).toBeInTheDocument();
    // Checks an interrupted "Lägg till i Matvaror" left behind keep the button reachable.
    expect(screen.getByRole("button", { name: "Lägg till i Matvaror" })).toBeInTheDocument();
  });

  describe("the week choice", () => {
    const thisWeekList = () =>
      vi.mocked(getShoppingList).mockResolvedValue(
        ok({ plan: null, lines: [], hiddenLines: [], pantryUnavailable: false, checksUnavailable: false, pendingClear: 0, ...noChoices }),
      );

    it("is left out on this week when next week has no dishes: the list is one list", async () => {
      thisWeekList();
      render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
      expect(screen.queryByTestId("week-select")).not.toBeInTheDocument();
    });

    it("shows on this week once next week has dishes", async () => {
      thisWeekList();
      weekCounts.mockImplementation(async (weeks) => Object.fromEntries(weeks.map((week) => [week, 2])));
      render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
      expect(screen.getByTestId("week-select")).toBeInTheDocument();
    });

    it("shows when the dish count cannot be read, and always on another week than this one", async () => {
      thisWeekList();
      weekCounts.mockRejectedValue(new Error("down"));
      const { unmount } = render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
      expect(screen.getByTestId("week-select")).toBeInTheDocument();
      unmount();
      weekCounts.mockResolvedValue({});
      const { addWeeks, currentWeekStart, weekParam } = await import("@/features/mealplan");
      const nextWeek = weekParam(addWeeks(currentWeekStart(new Date()), 1));
      render(<ToastProvider>{await ShoppingListContent({ searchParams: Promise.resolve({ vecka: nextWeek }) })}</ToastProvider>);
      expect(screen.getByTestId("week-select")).toBeInTheDocument();
    });
  });

  it("shows one list with the week as the segment, and a week without dishes offers to plan it", async () => {
    const now = new Date();
    const { addWeeks, currentWeekStart, weekParam } = await import("@/features/mealplan");
    const thisWeek = currentWeekStart(now);
    const nextWeek = addWeeks(thisWeek, 1);
    const dishLine = (label: string): ShoppingLine => ({
      key: `r:${label}:st`,
      label,
      amount: null,
      unit: null,
      isVague: false,
      coverage: { kind: "unlinked" },
      section: "Övrigt",
      origins: [],
      checked: false,
      isCustom: false,
    });
    vi.mocked(getShoppingList).mockImplementation(async (week) =>
      ok({
        plan: null,
        lines: week === thisWeek ? [dishLine("a"), dishLine("b")] : [],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        ...noChoices,
      }),
    );
    const { unmount } = render(
      <ToastProvider>{await ShoppingListContent({ searchParams: Promise.resolve({ vecka: weekParam(nextWeek) }) })}</ToastProvider>,
    );
    // The week is a quiet dropdown with this week, next week and the week after (no week menu or second heading).
    expect(screen.queryByRole("heading", { level: 2, name: "Att handla" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("week-menu")).not.toBeInTheDocument();
    const select = screen.getByTestId("week-select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.textContent)).toEqual(["Denna vecka", "Nästa vecka"]);
    expect(select.value).toBe(nextWeek);
    expect(screen.queryByTestId("week-tile")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tidigare veckor" })).not.toBeInTheDocument();
    expect(getShoppingList).toHaveBeenCalledWith(nextWeek);
    expect(screen.getByText("Inga rätter på matsedeln nästa vecka.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planera veckan" })).toHaveAttribute("href", `/matsedel?vecka=${weekParam(nextWeek)}`);
    unmount();

    vi.mocked(getShoppingList).mockResolvedValue(
      ok({ plan: null, lines: [], hiddenLines: [], pantryUnavailable: false, checksUnavailable: false, pendingClear: 0, ...noChoices }),
    );
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByText("Inga rätter på matsedeln den här veckan.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planera veckan" })).toHaveAttribute("href", `/matsedel?vecka=${weekParam(thisWeek)}`);
  });

  it("shows the selected store's offer as a price after the name, and no Produktval in the line's detail", async () => {
    getActiveOffers.mockResolvedValue([
      { id: "o1", name: "Matlagningsgrädde", label: "Arla Matlagningsgrädde", price: "19 kr/st", ingredientId: "11111111-1111-4111-8111-111111111111" },
      { id: "o2", name: "Annat", label: "Annat", price: "5 kr", ingredientId: null },
    ]);
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
    const content = await ShoppingListContent();
    await act(async () => {
      render(<ToastProvider>{content}</ToastProvider>);
    });
    expect(getActiveOffers).toHaveBeenCalledWith(store.id);
    // The price follows once the offers are read; the saved product choice shows nowhere on the list.
    expect(await screen.findByTestId("offer-tag")).toHaveTextContent("19 kr/st");
    expect(screen.queryByTestId("product-chip")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Grädde/ }));
    const detail = await screen.findByRole("dialog", { name: "Grädde" });
    expect(detail).not.toHaveTextContent(/produktval/i);
    expect(detail).not.toHaveTextContent("Arla Matlagningsgrädde 15 %");
  });

  it("shows the list without prices when the offers cannot be read", async () => {
    getActiveOffers.mockRejectedValue(new Error("down"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getShoppingList).mockResolvedValue(
      ok({
        plan: { id: "plan", name: "Vecka 44", dishCount: 1, skippedCount: 0, dishTitles: {} },
        lines: [
          {
            key: "r:11111111-1111-4111-8111-111111111111:dl",
            ingredientId: "11111111-1111-4111-8111-111111111111",
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
        ...noChoices,
        store: { id: "22222222-2222-4222-8222-222222222222", name: "ICA", chain: "ICA" as const, externalStoreId: null, address: null, url: null, offersUrl: null, isSelected: true },
        site: null,
      }),
    );
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: /^Grädde/ })).toBeInTheDocument();
    await waitFor(() => expect(log).toHaveBeenCalledWith("list_offers_unavailable", { reason: "Error" }));
    expect(screen.queryByTestId("offer-tag")).not.toBeInTheDocument();
    log.mockRestore();
  });

  it("passes the choices that cannot be read on to the export, and shows Kopiera till ICA-varukorgen", async () => {
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
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: "Kopiera till ICA-varukorgen" })).toBeInTheDocument();
    expect(screen.queryByText("Det gick inte att läsa produktvalet.")).not.toBeInTheDocument();
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
    expect(screen.getByText("Allt till veckans rätter finns redan i Matvaror för Stugan.")).toBeInTheDocument();
    // The button comes before the week picker and the list (Story 19.2: directly under the title).
    const line = screen.getByRole("button", { name: /^Boende: / });
    const list = screen.getByText("Allt till veckans rätter finns redan i Matvaror för Stugan.");
    expect(container).toContainElement(line);
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows no line with one place, and says everything is at home as in 1.0", async () => {
    listPantrySites.mockResolvedValue([hemmaSite]);
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: hemmaSite.id, name: "Hemma", siteCount: 1 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt till veckans rätter finns redan hemma.")).toBeInTheDocument();
  });

  it("shows the list without a line when the places cannot be read", async () => {
    listPantrySites.mockRejectedValue(new FakePantryDataError("read_failed"));
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: stuganSite.id, name: "Stugan", siteCount: 2 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt till veckans rätter finns redan i Matvaror för Stugan.")).toBeInTheDocument();
  });

  it("shows the list without a line, and logs only the error's name, when the places fail unexpectedly", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    listPantrySites.mockRejectedValue(new TypeError("Stugan broke"));
    vi.mocked(getShoppingList).mockResolvedValue(allInStock({ id: stuganSite.id, name: "Stugan", siteCount: 2 }));
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.queryByRole("button", { name: /^Boende: / })).toBeNull();
    expect(screen.getByText("Allt till veckans rätter finns redan i Matvaror för Stugan.")).toBeInTheDocument();
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
