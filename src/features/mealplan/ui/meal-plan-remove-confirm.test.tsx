import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok, type Result } from "@/lib/errors";
import type { PlanDish, PlanRecipeRow } from "../domain/meal-plan";
import { AddDishProvider } from "./add-dish-sheet";
import { MealPlanList } from "./meal-plan-list";
import { deleteGraceMs as removeGraceMs, resetDeleteGrace } from "@/components/confirm-delete";

// Story 13.3: "Ta bort från matsedeln" in a dish's ⋯ sheet asks "Ta bort <rätt> från matsedeln?" first,
// and the next removals within a minute go at once.

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
  vi.useRealTimers();
  resetDeleteGrace();
  removePlanRecipe.mockReset().mockImplementation(async (id) => ok(rowOf(dishes.find((d) => d.id === id)!)));
});

describe("removing a dish asks first", () => {
  it("asks, and Avbryt keeps the dish", async () => {
    renderPlan();
    await press("Pasta");
    const question = screen.getByRole("dialog", { name: "Ta bort" });
    expect(question).toHaveTextContent("Ta bort Pasta från matsedeln?");
    await act(async () => fireEvent.click(within(question).getByRole("button", { name: "Avbryt" })));
    expect(removePlanRecipe).not.toHaveBeenCalled();
    expect(screen.getAllByTestId("plan-dish")).toHaveLength(3);
  });

  it("removes on Ta bort, and the next removal goes at once; the question comes back after a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    renderPlan();
    await press("Pasta");
    const question = screen.getByRole("dialog", { name: "Ta bort" });
    await act(async () => fireEvent.click(within(question).getByRole("button", { name: "Ta bort" })));
    expect(removePlanRecipe).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("plan-dish")).toHaveLength(2);

    vi.advanceTimersByTime(removeGraceMs - 1000);
    await press("Soppa");
    expect(removePlanRecipe).toHaveBeenCalledTimes(2);

    // The window counts from the last removal.
    vi.advanceTimersByTime(removeGraceMs - 1000);
    await press("Gryta");
    expect(removePlanRecipe).toHaveBeenCalledTimes(3);
  });

  it("asks again when nothing was removed for a minute", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    renderPlan();
    await press("Pasta");
    await act(async () =>
      fireEvent.click(within(screen.getByRole("dialog", { name: "Ta bort" })).getByRole("button", { name: "Ta bort" })),
    );
    vi.advanceTimersByTime(removeGraceMs + 1000);
    await press("Soppa");
    expect(removePlanRecipe).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Ta bort" })).toHaveTextContent("Ta bort Soppa från matsedeln?");
  });
});
