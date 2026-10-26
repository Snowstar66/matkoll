import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
import { toSnapshot } from "@/features/pantry";
import { listRecipes, RecipeDataError } from "@/features/recipes/server";
import { MealPlanContent } from "./meal-plan-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/mealplan/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mealplan/server")>()),
  getMealPlanView: vi.fn(),
}));
vi.mock("@/features/recipes/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/recipes/server")>()),
  listRecipes: vi.fn(),
  searchRecipes: vi.fn(),
}));
vi.mock("@/features/mealplan/actions/add-to-current-plan", () => ({ addToCurrentPlan: vi.fn() }));
vi.mock("@/features/mealplan/actions/set-servings", () => ({ setServings: vi.fn() }));
vi.mock("@/features/mealplan/actions/remove-plan-recipe", () => ({ removePlanRecipe: vi.fn() }));
vi.mock("@/features/mealplan/actions/restore-plan-recipe", () => ({ restorePlanRecipe: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const dish = {
  id: "11111111-1111-4111-8111-111111111111",
  recipeId: null,
  recipeTitle: "Pasta",
  servings: 4,
  position: 0,
  recipe: null,
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.clearAllMocks();
  logged.mockRestore();
});

describe("MealPlanContent", () => {
  it("shows mealplan_unavailable when the plan cannot be read", async () => {
    vi.mocked(getMealPlanView).mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    vi.mocked(listRecipes).mockResolvedValue([]);
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matsedeln. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_unavailable", { reason: "query_failed 08006" });
    // The earlier plans can still be reached.
    expect(screen.getByRole("link", { name: "Tidigare" })).toHaveAttribute("href", "/matsedel/tidigare");
  });

  it("shows the plan when the library cannot be read, and the sheet says so", async () => {
    const user = userEvent.setup();
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [dish],
      snapshot: null,
      site: null,
    });
    vi.mocked(listRecipes).mockRejectedValue(new RecipeDataError("query_failed 08006"));
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.getByTestId("plan-dish")).toHaveTextContent("Pasta");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Tidigare" })).toHaveAttribute(
      "href",
      "/matsedel/tidigare",
    );
    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lägg till rätt" }));
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_recipes_unavailable", { reason: "query_failed 08006" });
  });

  const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };
  const recipeId = "22222222-2222-4222-8222-222222222222";
  /** Korv med ketchup: korv in the pantry, ketchup not. */
  const korv = {
    ...dish,
    recipeId,
    recipeTitle: "Korv med ketchup",
    recipe: {
      imageUrl: null,
      totalMinutes: 15,
      originalServings: 4,
      lines: [
        { id: "l1", ingredientId: "korv", amount: 4, unit: "st" as const, isVague: false },
        { id: "l2", ingredientId: "ketchup", amount: 1, unit: "dl" as const, isVague: false },
      ],
    },
  };

  it("says which place the dishes' status is counted against under the page title", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [korv],
      snapshot: toSnapshot([{ ingredientId: "korv", amount: 8, unit: "st" }]),
      site: stugan,
    });
    vi.mocked(listRecipes).mockResolvedValue([]);
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    const siteLine = screen.getByText("Lager: Stugan");
    expect(siteLine).toHaveClass("text-meta", "text-ink-2");
    expect(siteLine.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    // Right under the title, before the plan's name.
    expect(
      screen.getByRole("heading", { name: "Matsedel" }).compareDocumentPosition(siteLine) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(siteLine.compareDocumentPosition(screen.getByTestId("plan-name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByTestId("plan-dish")).getByText("1 av 2 hemma")).toBeInTheDocument();
  });

  it("has no line above dishes without a status: their recipes deleted or not read", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [dish, { ...dish, id: "33333333-3333-4333-8333-333333333333", recipeId, recipe: null }],
      snapshot: toSnapshot([]),
      site: stugan,
    });
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.getAllByTestId("plan-dish")).toHaveLength(2);
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
  });

  it("has no line with one place, or without dishes", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [korv],
      snapshot: toSnapshot([]),
      site: { ...stugan, name: "Hemma", siteCount: 1 },
    });
    const { unmount } = render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
    unmount();
    vi.mocked(getMealPlanView).mockResolvedValue({ plan: null, dishes: [], snapshot: toSnapshot([]), site: stugan });
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.getByText("Ingen rätt på matsedeln än.")).toBeInTheDocument();
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
  });
});
