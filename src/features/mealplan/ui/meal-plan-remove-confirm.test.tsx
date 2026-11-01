import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok, type Result } from "@/lib/errors";
import type { PlanDish, PlanRecipeRow } from "../domain/meal-plan";
import { AddDishProvider } from "./add-dish-sheet";
import { MealPlanList } from "./meal-plan-list";

// Story 19.4: "Ta bort från matsedeln" in a dish's ⋯ sheet removes at once (Ångra brings it back), so it never asks.

const removePlanRecipe = vi.fn<(id: string) => Promise<Result<PlanRecipeRow>>>();
vi.mock("../actions/remove-plan-recipe", () => ({ removePlanRecipe: (id: string) => removePlanRecipe(id) }));
vi.mock("../actions/restore-plan-recipe", () => ({ restorePlanRecipe: vi.fn() }));
vi.mock("../actions/set-servings", () => ({ setServings: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const dish = (n: number, title: string): PlanDish => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`,
  recipeId: null,
  recipeTitle: title,
  servings: 4,
  position: n,
  recipe: null,
});
const dishes = [dish(1, "Pasta"), dish(2, "Soppa"), dish(3, "Gryta")];
const rowOf = ({ id, recipeId, recipeTitle, servings, position }: PlanDish): PlanRecipeRow => ({
  id,
  mealPlanId: "99999999-9999-4999-8999-999999999999",
  recipeId,
  recipeTitle,
  servings,
  position,
});

function renderPlan() {
  render(
    <ToastProvider>
      <AddDishProvider recipes={[]} searchRecipes={async () => ok([])}>
        <MealPlanList planName="Vecka 44" dishes={dishes} snapshot={null} />
      </AddDishProvider>
    </ToastProvider>,
  );
}
// Through the ⋯ sheet's "Ta bort från matsedeln".
const press = async (title: string) => {
  await act(async () => fireEvent.click(screen.getByRole("button", { name: `Fler val för ${title}` })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort från matsedeln" }), { detail: 0 }));
};

beforeEach(() => {
  removePlanRecipe.mockReset().mockImplementation(async (id) => ok(rowOf(dishes.find((d) => d.id === id)!)));
});

describe("removing a dish never asks (Story 19.4)", () => {
  it("removes at once and says Tog bort with Ångra, however often", async () => {
    renderPlan();
    await press("Pasta");
    expect(screen.queryByRole("dialog", { name: /Ta bort/ })).toBeNull();
    expect(removePlanRecipe).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("plan-dish")).toHaveLength(2);
    expect(screen.getAllByText("Tog bort Pasta.").length).toBeGreaterThan(0);
    await press("Soppa");
    expect(removePlanRecipe).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });
});
