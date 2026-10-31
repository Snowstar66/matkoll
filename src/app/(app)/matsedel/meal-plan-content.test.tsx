import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { getMealPlanView, MealPlanDataError } from "@/features/mealplan/server";
import { toSnapshot } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { SiteSwitchProvider } from "@/features/pantry/ui/site-switching";
import { listRecipes, RecipeDataError } from "@/features/recipes/server";
import { MealPlanContent } from "./meal-plan-content";

vi.mock("@/features/auth/server", () => ({ requireUserOrRedirect: vi.fn(async () => ({ id: "user" })) }));
vi.mock("@/features/mealplan/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/mealplan/server")>()),
  getMealPlanView: vi.fn(),
  getWeekCounts: vi.fn(async () => ({})),
}));
vi.mock("@/features/recipes/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/recipes/server")>()),
  listRecipes: vi.fn(),
  searchRecipes: vi.fn(),
}));
vi.mock("@/features/pantry/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/pantry/server")>()),
  listPantrySites: vi.fn(),
}));
vi.mock("@/features/pantry/actions/select-pantry-site", () => ({ selectPantrySite: vi.fn() }));
vi.mock("../boende-counts", () => ({ loadBoendeCounts: vi.fn(async () => null) }));
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
const hemma = { id: "66666666-6666-4666-8666-666666666666", name: "Hemma", isSelected: true };
const stuganSite = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", isSelected: false };
beforeEach(() => {
  vi.mocked(listPantrySites).mockResolvedValue([hemma]);
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
    render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent()}</ToastProvider></SiteSwitchProvider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa matsedeln. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_unavailable", { reason: "query_failed 08006" });
    // The earlier plans can still be reached.
    expect(screen.getByRole("link", { name: "Tidigare veckor" })).toHaveAttribute("href", "/matsedel/tidigare");
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
    render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent()}</ToastProvider></SiteSwitchProvider>);
    expect(screen.getByTestId("plan-dish")).toHaveTextContent("Pasta");
    expect(screen.getByRole("link", { name: "Tidigare veckor" })).toHaveAttribute("href", "/matsedel/tidigare");
    await user.click(within(screen.getByRole("banner")).getByRole("button", { name: "Lägg till rätt" }));
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
    expect(logged).toHaveBeenCalledWith("mealplan_recipes_unavailable", { reason: "query_failed 08006" });
  });

  it("lights the day ?dag= names, for a moment (Story 13.8)", async () => {
    vi.mocked(getMealPlanView).mockResolvedValue({ plan: { id: "plan", name: "Vecka 44" }, dishes: [{ ...dish, weekday: 3 }], snapshot: null, site: null });
    vi.mocked(listRecipes).mockResolvedValue([]);
    render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent({ searchParams: Promise.resolve({ dag: "3" }) })}</ToastProvider></SiteSwitchProvider>);
    const days = screen.getAllByTestId("plan-day");
    expect(days.filter((day) => day.hasAttribute("data-highlight")).map((day) => day.getAttribute("data-day"))).toEqual(["3"]);
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

  it("shows the boende as a button under the week line, in place of \"Boende: Stugan\" (Story 16.14)", async () => {
    vi.mocked(listPantrySites).mockResolvedValue([{ ...hemma, isSelected: false }, { ...stuganSite, isSelected: true }]);
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [korv],
      snapshot: toSnapshot([{ ingredientId: "korv", amount: 8, unit: "st" }]),
      site: stugan,
    });
    vi.mocked(listRecipes).mockResolvedValue([]);
    render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent()}</ToastProvider></SiteSwitchProvider>);
    const button = screen.getByRole("button", { name: "Boende: Stugan" });
    expect(button).toHaveTextContent("Stugan");
    expect(screen.queryByText(/^Boende:/)).not.toBeInTheDocument();
    // Under the title, before the plan's name; a phone only (the side menu has it from 1024 px).
    expect(screen.getByRole("heading", { name: "Matsedel" }).compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.compareDocumentPosition(screen.getByTestId("plan-name")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(button.closest("[data-testid=boende-page]")).toHaveClass("desktop:hidden");
    expect(within(screen.getByTestId("plan-dish")).getByTestId("dish-meta")).toHaveTextContent(/^15 min · \d+ port\.1 av 2 hemma$/);
  });

  it("shows nothing about the boende with one boende, or when the boenden cannot be read", async () => {
    vi.mocked(listRecipes).mockResolvedValue([]);
    vi.mocked(getMealPlanView).mockResolvedValue({
      plan: { id: "plan", name: "Vecka 44" },
      dishes: [korv],
      snapshot: toSnapshot([]),
      site: { ...stugan, name: "Hemma", siteCount: 1 },
    });
    const { unmount } = render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent()}</ToastProvider></SiteSwitchProvider>);
    expect(screen.queryByTestId("boende-page")).not.toBeInTheDocument();
    unmount();
    vi.mocked(listPantrySites).mockRejectedValue(new PantryDataError("query_failed 08006"));
    render(<SiteSwitchProvider><ToastProvider>{await MealPlanContent()}</ToastProvider></SiteSwitchProvider>);
    expect(screen.queryByTestId("boende-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("plan-dish")).toBeInTheDocument();
    expect(logged).toHaveBeenCalledWith("mealplan_sites_unavailable", { reason: "query_failed 08006" });
  });
});
