import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { PlanOption } from "@/features/suggestions";
import type { PlanDish, PlanRecipeRow } from "../domain/meal-plan";
import { WeekPlanner } from "./week-planner";

const addToCurrentPlan = vi.fn();
const removePlanRecipe = vi.fn();
const restorePlanRecipe = vi.fn();
const setWeekday = vi.fn();
const refresh = vi.fn();
vi.mock("../actions/add-to-current-plan", () => ({ addToCurrentPlan: (input: unknown) => addToCurrentPlan(input) }));
vi.mock("../actions/remove-plan-recipe", () => ({ removePlanRecipe: (id: string) => removePlanRecipe(id) }));
vi.mock("../actions/restore-plan-recipe", () => ({ restorePlanRecipe: (row: unknown) => restorePlanRecipe(row) }));
vi.mock("../actions/set-weekday", () => ({ setWeekday: (change: unknown) => setWeekday(change) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const uuid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const option = (n: number, title: string, extra: Partial<PlanOption> = {}): PlanOption => ({
  id: uuid(n),
  title,
  isFavorite: false,
  imageUrl: null,
  totalMinutes: 30,
  servings: 4,
  cookedTimes: 0,
  meta: "30 min",
  buy: 2,
  deal: null,
  ...extra,
});

const tacos = option(1, "Tacos", { isFavorite: true, cookedTimes: 9, meta: "Favorit · lagad 9 gånger", buy: 4 });
const korv = option(2, "Korvstroganoff", {
  isFavorite: true,
  meta: "Favorit · 30 min",
  buy: 3,
  deal: { text: "Falukorv och grädde på erbjudande · spara 21 kr", savingKr: 21, savingPercent: 20 },
});
const lax = option(3, "Laxpasta", { deal: { text: "Laxfilé på erbjudande · spara 25 %", savingKr: null, savingPercent: 25 } });
const soppa = option(4, "Linssoppa", { meta: "40 min" });
const options = [tacos, korv, lax, soppa];

const onWeek = (n: number, title: string, weekday: number | null = null): PlanDish => ({
  id: uuid(n + 50),
  recipeId: uuid(n),
  recipeTitle: title,
  servings: 4,
  position: n,
  weekday,
  recipe: null,
});

function renderPlanner(dishes: PlanDish[] = [], opts: PlanOption[] | null = options, toBuy: number | null = 0) {
  return render(
    <ToastProvider>
      <WeekPlanner weekStart="2026-11-02" dishes={dishes} options={opts} toBuy={toBuy} offersFooter={<p>Idéer</p>} />
    </ToastProvider>,
  );
}

const rowTitles = () => screen.queryAllByTestId("plan-option").map((row) => row.querySelector("p")?.textContent);

beforeEach(() => {
  addToCurrentPlan.mockReset().mockImplementation(async (input: { recipeId: string; id: string; weekday: number | null }) =>
    ok({
      id: input.id,
      mealPlanId: "plan",
      recipeId: input.recipeId,
      recipeTitle: "Tacos",
      servings: 4,
      position: 9,
      weekday: input.weekday,
    } satisfies PlanRecipeRow),
  );
  removePlanRecipe.mockReset();
  restorePlanRecipe.mockReset();
  setWeekday.mockReset().mockImplementation(async (change: unknown) => ok(change));
  refresh.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("WeekPlanner, the tabs", () => {
  it("starts on Favoriter with the most cooked first, with meta and the offer line", () => {
    renderPlanner();
    expect(screen.getByRole("radio", { name: "Favoriter" })).toBeChecked();
    expect(rowTitles()).toEqual(["Tacos", "Korvstroganoff"]);
    const korvRow = screen.getAllByTestId("plan-option")[1];
    expect(korvRow).toHaveTextContent("Favorit · 30 min");
    expect(within(korvRow).getByTestId("plan-option-deal")).toHaveTextContent("Falukorv och grädde på erbjudande · spara 21 kr");
    expect(screen.getAllByTestId("plan-option")[0]).toHaveTextContent("Favorit · lagad 9 gånger");
  });

  it("På erbjudande lists only recipes with an offer, most saved first, with the hint and the ideas footer", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("radio", { name: "På erbjudande" }));
    expect(rowTitles()).toEqual(["Korvstroganoff", "Laxpasta"]);
    expect(screen.getByTestId("offers-hint")).toHaveTextContent("Dina recept där en huvudvara är på erbjudande, mest sparat först.");
    expect(screen.getByText("Idéer")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Alla recept" }));
    expect(rowTitles()).toEqual(["Korvstroganoff", "Laxpasta", "Linssoppa", "Tacos"]);
    expect(screen.getByText("Idéer")).not.toBeVisible();
  });

  it("falls back to Alla recept without favourites, and says when a tab is empty", async () => {
    const user = userEvent.setup();
    renderPlanner([], [soppa]);
    expect(screen.getByRole("radio", { name: "Alla recept" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "På erbjudande" }));
    expect(screen.getByTestId("options-empty")).toHaveTextContent("Inget av dina recept har en huvudvara på erbjudande just nu.");
  });

  it("says when the library cannot be read", () => {
    renderPlanner([], null);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
  });
});

describe("WeekPlanner, adding without a day", () => {
  it("puts the dish on the week with weekday null, shows it with Ingen dag, and says so with Välj dag", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(addToCurrentPlan).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: tacos.id, weekStart: "2026-11-02", weekday: null, servings: 4 }),
    );
    const dish = await screen.findByTestId("plan-dish");
    expect(dish).toHaveTextContent("Tacos");
    expect(within(dish).getByTestId("dish-day")).toHaveTextContent("Ingen dag");
    expect(within(dish).getByTestId("dish-note")).toHaveTextContent("4 varor att köpa");
    expect(screen.getByRole("status")).toHaveTextContent("Tacos på veckan. 4 varor på listan.");
    expect(screen.getByRole("button", { name: "Välj dag" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    // The row now says På veckan instead of +.
    const row = screen.getAllByTestId("plan-option")[0];
    expect(within(row).getByTestId("on-week")).toHaveTextContent("På veckan");
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("1 rätt");
  });

  it("opens the day picker from Välj dag and moves the dish", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    await user.click(await screen.findByRole("button", { name: "Välj dag" }));
    const dialog = await screen.findByRole("dialog", { name: /Flytta till dag/ });
    await user.click(within(dialog).getByRole("button", { name: "Onsdag" }));
    await waitFor(() => expect(setWeekday).toHaveBeenCalledWith({ id: expect.any(String), weekday: 3 }));
    await waitFor(() => expect(screen.getByTestId("dish-day")).toHaveTextContent("Ons"));
  });

  it("shows an error and no dish when the add fails", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(fail("mealplan_add_failed"));
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-dish")).not.toBeInTheDocument();
  });

  it("marks recipes already on the week as På veckan", () => {
    renderPlanner([onWeek(2, "Korvstroganoff", 2)]);
    const row = screen.getAllByTestId("plan-option")[1];
    expect(within(row).getByTestId("on-week")).toBeInTheDocument();
    expect(screen.getByTestId("dish-day")).toHaveTextContent("Tis");
  });
});

describe("WeekPlanner, Veckans rätter and the bar", () => {
  it("links the title to the recipe and shows the offer line or what is left to buy", () => {
    renderPlanner([onWeek(2, "Korvstroganoff", 1), onWeek(1, "Tacos")]);
    const dishes = screen.getAllByTestId("plan-dish");
    expect(within(dishes[0]).getByRole("link", { name: "Tacos" })).toHaveAttribute("href", `/recept/${tacos.id}`);
    expect(within(dishes[0]).getByTestId("dish-note")).toHaveTextContent("4 varor att köpa");
    expect(within(dishes[1]).getByTestId("dish-note")).toHaveTextContent("Falukorv och grädde på erbjudande · spara 21 kr");
  });

  it("removes with ✕ at once and offers Ångra, which puts it back", async () => {
    const user = userEvent.setup();
    const dish = onWeek(1, "Tacos", 1);
    const row: PlanRecipeRow = { id: dish.id, mealPlanId: "plan", recipeId: dish.recipeId, recipeTitle: "Tacos", servings: 4, position: 1, weekday: 1 };
    removePlanRecipe.mockResolvedValue(ok(row));
    restorePlanRecipe.mockResolvedValue(ok(row));
    renderPlanner([dish]);
    await user.click(screen.getByRole("button", { name: "Ta bort Tacos" }));
    expect(removePlanRecipe).toHaveBeenCalledWith(dish.id);
    expect(screen.queryByTestId("plan-dish")).not.toBeInTheDocument();
    expect(screen.getByTestId("week-empty")).toBeInTheDocument();
    expect((await screen.findAllByText("Tog bort Tacos.")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /Ångra/ }));
    await waitFor(() => expect(restorePlanRecipe).toHaveBeenCalledWith(row));
    expect(await screen.findByTestId("plan-dish")).toHaveTextContent("Tacos");
  });

  it("brings the dish back when removing fails", async () => {
    const user = userEvent.setup();
    removePlanRecipe.mockResolvedValue(fail("mealplan_remove_failed"));
    renderPlanner([onWeek(1, "Tacos")]);
    await user.click(screen.getByRole("button", { name: "Ta bort Tacos" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("plan-dish")).toBeInTheDocument();
  });

  it("says dishes and items to buy in the bar, with Inköpslistan leading to the list of the week", () => {
    renderPlanner([onWeek(1, "Tacos"), onWeek(2, "Korvstroganoff")], options, 6);
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("2 rätter · 6 varor att köpa");
    expect(screen.getByTestId("week-bar")).toHaveTextContent("Det du har hemma räknas bort.");
    expect(screen.getByRole("link", { name: "Inköpslistan" })).toHaveAttribute("href", "/lista");
  });
});
