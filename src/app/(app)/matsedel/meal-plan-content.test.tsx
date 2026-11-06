import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import { getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { SiteSwitchProvider } from "@/features/pantry/ui/site-switching";
import { RecipeDataError } from "@/features/recipes/server";
import { getShoppingList } from "@/features/shopping/server";
import { weekPlanOptions } from "@/features/suggestions/server";
import { MealPlanContent } from "./meal-plan-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/mealplan/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mealplan/server")>()),
  getMealPlanView: vi.fn(),
  getWeekCounts: vi.fn(async () => ({})),
  addToCurrentPlan: vi.fn(),
}));
vi.mock("@/features/suggestions/server", () => ({ weekPlanOptions: vi.fn() }));
vi.mock("@/features/shopping/server", () => ({ getShoppingList: vi.fn() }));
vi.mock("@/features/catalog/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/server")>()),
  searchIngredients: vi.fn(),
}));
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  listPantrySites: vi.fn(),
}));
vi.mock("@/features/pantry/actions/select-pantry-site", () => ({ selectPantrySite: vi.fn() }));
vi.mock("../boende-counts", () => ({ loadBoendeCounts: vi.fn(async () => null) }));
vi.mock("@/features/mealplan/actions/add-to-current-plan", () => ({ addToCurrentPlan: vi.fn() }));
vi.mock("@/features/mealplan/actions/remove-plan-recipe", () => ({ removePlanRecipe: vi.fn() }));
vi.mock("@/features/mealplan/actions/restore-plan-recipe", () => ({ restorePlanRecipe: vi.fn() }));
vi.mock("@/features/mealplan/actions/set-weekday", () => ({ setWeekday: vi.fn() }));
vi.mock("../lista/list-offers", () => ({
  ListOffers: ({ next }: { next?: string }) => <button type="button" aria-label="Erbjudanden" data-next={next} />,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The AI ideas have their own tests (week-planner e2e); the page only places them.
vi.mock("./offer-ideas", () => ({ OfferIdeas: () => <div data-testid="offer-ideas" /> }));

const dish = {
  id: "11111111-1111-4111-8111-111111111111",
  recipeId: null,
  recipeTitle: "Pasta",
  servings: 4,
  position: 0,
  recipe: null,
};
const view = { plan: { id: "plan", name: "Vecka 44" }, dishes: [dish], snapshot: null, site: null };

let logged: ReturnType<typeof vi.spyOn>;
const hemma = { id: "66666666-6666-4666-8666-666666666666", name: "Hemma", isSelected: true };
const stuganSite = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", isSelected: false };

const line = (key: string, extra: Record<string, unknown> = {}) => ({ key, label: key, checked: false, isCustom: false, ...extra });
const list = (lines: unknown[]) => ok({ plan: null, lines, hiddenLines: [], pantryUnavailable: false, checksUnavailable: false });

beforeEach(() => {
  vi.mocked(listPantrySites).mockResolvedValue([hemma]);
  vi.mocked(weekPlanOptions).mockResolvedValue([]);
  vi.mocked(getShoppingList).mockResolvedValue(list([]) as never);
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  logged.mockRestore();
});

async function show() {
  return render(
    <SiteSwitchProvider>
      <ToastProvider>{await MealPlanContent()}</ToastProvider>
    </SiteSwitchProvider>,
  );
}

describe("MealPlanContent", () => {
  it("shows mealplan_unavailable when the plan cannot be read", async () => {
    vi.mocked(getMealPlanView).mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    await show();
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matsedeln. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_unavailable", { reason: "query_failed 08006" });
    // The earlier plans can still be reached.
    expect(screen.getByRole("link", { name: "Tidigare veckor" })).toHaveAttribute("href", "/matsedel/tidigare");
  });

  it("shows the week when the library cannot be read, and says so", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    vi.mocked(weekPlanOptions).mockRejectedValue(new RecipeDataError("query_failed 08006"));
    await show();
    expect(screen.getByTestId("plan-dish")).toHaveTextContent("Pasta");
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_recipes_unavailable", { reason: "query_failed 08006" });
  });

  it("puts Erbjudanden in the header, returning to Matsedel after sign-in, and no + for a sheet or suggestions panel", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    await show();
    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "Erbjudanden" })).toHaveAttribute("data-next", "/matsedel");
    expect(header.queryByRole("button", { name: "Lägg till rätt" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("suggestions-from-offers")).not.toBeInTheDocument();
  });

  it("counts the items still to buy from the week's shopping list, without own items and checked lines", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    vi.mocked(getShoppingList).mockResolvedValue(
      list([line("a"), line("b"), line("c", { checked: true }), line("d", { isCustom: true })]) as never,
    );
    await show();
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("1 rätt · 2 varor att köpa");
  });

  it("names only the dishes when the list cannot be counted", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    vi.mocked(getShoppingList).mockResolvedValue(fail("shopping_unavailable"));
    await show();
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent(/^1 rätt$/);
  });

  it("shows the boende as a button under the title (Story 16.14)", async () => {
    vi.mocked(listPantrySites).mockResolvedValue([{ ...hemma, isSelected: false }, { ...stuganSite, isSelected: true }]);
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    await show();
    const button = screen.getByRole("button", { name: "Boende: Stugan" });
    expect(screen.getByRole("heading", { name: "Matsedel" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.closest("[data-testid=boende-page]")).toHaveClass("desktop:hidden");
  });

  it("shows nothing about the boende with one boende, or when the boenden cannot be read", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue(view);
    const { unmount } = await show();
    expect(screen.queryByTestId("boende-page")).not.toBeInTheDocument();
    unmount();
    vi.mocked(listPantrySites).mockRejectedValue(new PantryDataError("query_failed 08006"));
    await show();
    expect(screen.queryByTestId("boende-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-dish")).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("mealplan_sites_unavailable", { reason: "query_failed 08006" });
  });
});
