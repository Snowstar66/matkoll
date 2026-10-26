import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
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

const noChoices = { store: null, storeUnavailable: false, productChoices: {}, productChoicesUnavailable: false, unreadableChoices: [] };

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
    expect(screen.getByRole("button", { name: "Lägg till egen vara" })).toBeInTheDocument();
    // Checks an interrupted "Lägg i lagret" left behind keep the button reachable.
    expect(screen.getByRole("button", { name: "Lägg i lagret" })).toBeInTheDocument();
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
      }),
    );
    const user = userEvent.setup();
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    await user.click(screen.getByRole("button", { name: /^Grädde/ }));
    const detail = await screen.findByRole("dialog", { name: "Grädde" });
    expect(detail).toHaveTextContent("Arla Matlagningsgrädde 15 % · 5 dl");
  });

  it("passes the choices that cannot be read on to the line's detail, and shows Skicka till ICA", async () => {
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
          isSelected: true,
        },
        unreadableChoices: [graddeId],
      }),
    );
    const user = userEvent.setup();
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByRole("button", { name: "Skicka till ICA" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Grädde/ }));
    const detail = await screen.findByRole("dialog", { name: "Grädde" });
    expect(detail).toHaveTextContent("Det gick inte att läsa produktvalet.");
  });
});
