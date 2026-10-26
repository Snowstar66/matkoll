import { render, screen } from "@testing-library/react";
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
vi.mock("@/features/catalog/server", () => ({ searchIngredients: vi.fn() }));

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
      }),
    );
    render(<ToastProvider>{await ShoppingListContent()}</ToastProvider>);
    expect(screen.getByText("Allt finns hemma.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lägg till egen vara" })).toBeInTheDocument();
  });
});
