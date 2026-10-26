import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
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
    vi.mocked(getMealPlanView).mockResolvedValue({ plan: { id: "plan", name: "Vecka 44" }, dishes: [dish], snapshot: null });
    vi.mocked(listRecipes).mockRejectedValue(new RecipeDataError("query_failed 08006"));
    render(<ToastProvider>{await MealPlanContent()}</ToastProvider>);
    expect(screen.getByTestId("plan-dish")).toHaveTextContent("Pasta");
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Tidigare" })).toHaveAttribute(
      "href",
      "/matsedel/tidigare",
    );
    await user.click(screen.getByRole("button", { name: "Lägg till rätt" }));
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_recipes_unavailable", { reason: "query_failed 08006" });
  });
});
