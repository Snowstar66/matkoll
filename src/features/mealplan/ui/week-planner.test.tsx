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
  buyNames: ["tomat", "lök"],
  deal: null,
  ...extra,
});

const tacos = option(1, "Tacos", { isFavorite: true, cookedTimes: 9, meta: "Favorit · lagad 9 gånger", buy: 4, buyNames: ["tortillabröd", "gräddfil", "tomat", "ost"] });
const korv = option(2, "Korvstroganoff", {
  isFavorite: true,
  meta: "Favorit · 30 min",
  buy: 3,
  deal: {
    text: "Falukorv och grädde på erbjudande · −21 kr",
    savingKr: 21,
    savingPercent: 20,
    tags: [
      { name: "Falukorv", price: "2 för 50 kr" },
      { name: "Grädde", price: "19 kr/st" },
    ],
  },
});
const lax = option(3, "Laxpasta", { deal: { text: "Laxfilé på erbjudande · −25 %", savingKr: null, savingPercent: 25, tags: [{ name: "Laxfilé", price: "129 kr/kg" }] } });
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

function renderPlanner(dishes: PlanDish[] = [], opts: PlanOption[] | null = options, toBuy: number | null = 0, firstOpenDay = 1) {
  return render(
    <ToastProvider>
      <WeekPlanner weekStart="2026-11-02" firstOpenDay={firstOpenDay} dishes={dishes} options={opts} toBuy={toBuy} offersFooter={<p>Idéer</p>} />
    </ToastProvider>,
  );
}

const rowTitles = () => screen.queryAllByTestId("plan-option").map((row) => row.querySelector("p")?.textContent);

beforeEach(() => {
  // The library is folded until opened; most tests start with it open.
  window.localStorage.setItem("matkoll.mealplan.library-open", "1");
  addToCurrentPlan.mockReset().mockImplementation(async (input: { recipeId: string; id: string; weekday?: number | null }) =>
    ok({
      id: input.id,
      mealPlanId: "plan",
      recipeId: input.recipeId,
      recipeTitle: "Tacos",
      servings: 4,
      position: 9,
      // The server picks the first free day when none is sent: here Thursday.
      weekday: input.weekday === undefined ? 4 : input.weekday,
    } satisfies PlanRecipeRow),
  );
  removePlanRecipe.mockReset();
  restorePlanRecipe.mockReset();
  setWeekday.mockReset().mockImplementation(async (change: unknown) => ok(change));
  refresh.mockReset();
  // Every bin shares one double-tap guard on the clock; each press reads a clock a second on.
  let clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (clock += 1000));
});
afterEach(() => vi.restoreAllMocks());

describe("WeekPlanner, the tabs", () => {
  it("starts on Favoriter with the most cooked first, with meta and the offer line", () => {
    renderPlanner();
    expect(screen.getByRole("radio", { name: "Favoriter" })).toBeChecked();
    expect(rowTitles()).toEqual(["Tacos", "Korvstroganoff"]);
    const korvRow = screen.getAllByTestId("plan-option")[1];
    expect(korvRow).toHaveTextContent("Favorit · 30 min");
    expect(within(korvRow).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Falukorv 2 för 50 kr", "Grädde 19 kr/st"]);
    expect(screen.getAllByTestId("plan-option")[0]).toHaveTextContent("Favorit · lagad 9 gånger");
  });

  it("På erbjudande lists only recipes with an offer, most saved first, with the hint and the ideas footer", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("radio", { name: "På erbjudande" }));
    expect(rowTitles()).toEqual(["Korvstroganoff", "Laxpasta"]);
    expect(screen.getByTestId("offers-hint")).toHaveTextContent("Förslag för att varorna är på erbjudande den här veckan.");
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

  it("leaves out dishes already on the week, and says so when a tab has nothing else", () => {
    renderPlanner([onWeek(1, "Tacos", 2), onWeek(2, "Korvstroganoff", 3)]);
    expect(rowTitles()).toEqual([]);
    expect(screen.getByTestId("options-empty")).toHaveTextContent("Alla dina favoriter ligger redan på veckan.");
    expect(screen.queryByTestId("on-week")).not.toBeInTheDocument();
  });

  it("says when the library cannot be read", () => {
    renderPlanner([], null);
    expect(screen.getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
  });
});

describe("WeekPlanner, the folded library", () => {
  it("is collapsed until opened, remembers the choice, and a free day opens it", async () => {
    window.localStorage.removeItem("matkoll.mealplan.library-open");
    const user = userEvent.setup();
    const { unmount } = renderPlanner();
    const toggle = screen.getByRole("button", { name: "Lägg till nya rätter" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("radio", { name: "Favoriter" })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("radio", { name: "Favoriter" })).toBeVisible();
    unmount();
    renderPlanner();
    expect(screen.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Lägg till nya rätter" }));
    expect(window.localStorage.getItem("matkoll.mealplan.library-open")).toBe("0");
    await user.click(screen.getAllByTestId("free-day")[0]);
    expect(screen.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "true");
    // The stored choice is left as it was.
    expect(window.localStorage.getItem("matkoll.mealplan.library-open")).toBe("0");
  });
});

describe("WeekPlanner, adding without a day", () => {
  it("puts the dish on the day the server picks, shows it there, and says so with Byt dag", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(addToCurrentPlan).toHaveBeenCalledWith(
      expect.objectContaining({ recipeId: tacos.id, weekStart: "2026-11-02", servings: 4 }),
    );
    // No day is sent: choosing it is the server's job.
    expect(addToCurrentPlan.mock.calls[0][0]).not.toHaveProperty("weekday");
    const dish = await screen.findByTestId("plan-dish");
    expect(dish).toHaveTextContent("Tacos");
    expect(within(dish).getByTestId("dish-day")).toHaveTextContent("Tor");
    expect(within(dish).getByTestId("dish-note")).toHaveTextContent("4 varor att köpa");
    expect(screen.getByRole("status")).toHaveTextContent("Tacos på torsdag. Tortillabröd, gräddfil, tomat och 1 till står på inköpslistan.");
    expect(screen.getByRole("button", { name: "Byt dag" })).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
    // The dish leaves the library list at once.
    expect(rowTitles()).toEqual(["Korvstroganoff"]);
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("1 rätt");
  });

  it("says the week is full, with Välj dag, when the dish got no day", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockImplementation(async (input: { recipeId: string; id: string }) =>
      ok({ id: input.id, mealPlanId: "plan", recipeId: input.recipeId, recipeTitle: "Tacos", servings: 4, position: 9, weekday: null } satisfies PlanRecipeRow),
    );
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(await screen.findByTestId("plan-dish")).toHaveTextContent("Tacos");
    expect(screen.getByTestId("no-day-label")).toHaveTextContent("Ingen dag");
    expect(screen.getByRole("status")).toHaveTextContent("Tacos på veckan. Alla dagar har en rätt. Tortillabröd, gräddfil, tomat och 1 till står på inköpslistan.");
    expect(screen.getByRole("button", { name: "Välj dag" })).toBeInTheDocument();
    expect(rowTitles()).toEqual(["Korvstroganoff"]);
  });

  it("opens the day picker from Byt dag and moves the dish", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    await user.click(await screen.findByRole("button", { name: "Byt dag" }));
    const dialog = await screen.findByRole("dialog", { name: "Tacos" });
    await user.click(within(dialog).getByRole("button", { name: /^Onsdag 4\/11/ }));
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

  it("leaves recipes already on the week out of the library, and shows them in the week", () => {
    renderPlanner([onWeek(2, "Korvstroganoff", 2)]);
    expect(rowTitles()).toEqual(["Tacos"]);
    expect(screen.getByTestId("dish-day")).toHaveTextContent("Tis");
  });
});

describe("WeekPlanner, the day sheet (UX-33)", () => {
  it("is named by the dish, shows dates and what lies on each day, hides passed days and ends with Ingen dag", async () => {
    const user = userEvent.setup();
    renderPlanner([onWeek(1, "Tacos", 4), onWeek(2, "Korvstroganoff", 5), onWeek(3, "Laxpasta", null)], options, 0, 4);
    await user.click(screen.getAllByTestId("dish-day")[0]);
    const dialog = await screen.findByRole("dialog", { name: "Tacos" });
    expect(within(dialog).getAllByTestId("day-choice").map((choice) => choice.textContent)).toEqual([
      "Torsdag 5/11",
      "Fredag 6/11 · Korvstroganoff",
      "Lördag 7/11",
      "Söndag 8/11",
      "Ingen dag",
    ]);
  });
});

describe("WeekPlanner, Veckans rätter and the bar", () => {
  it("lists the dishes Mån to Sön, those with no day last, and re-sorts when a day is changed", async () => {
    const user = userEvent.setup();
    renderPlanner([onWeek(3, "Laxpasta", null), onWeek(2, "Korvstroganoff", 5), onWeek(1, "Tacos", 2)]);
    const titles = () => screen.getAllByTestId("plan-dish").map((dish) => dish.querySelector("a")?.textContent);
    expect(titles()).toEqual(["Tacos", "Korvstroganoff", "Laxpasta"]);
    await user.click(screen.getAllByTestId("dish-day")[2]);
    const dialog = await screen.findByRole("dialog", { name: "Laxpasta" });
    await user.click(within(dialog).getByRole("button", { name: /^Måndag 2\/11/ }));
    await waitFor(() => expect(titles()).toEqual(["Laxpasta", "Tacos", "Korvstroganoff"]));
  });

  it("links the title to the recipe and shows what is left to buy and the offers as tags", () => {
    renderPlanner([onWeek(2, "Korvstroganoff", 2), onWeek(1, "Tacos", 1)]);
    const dishes = screen.getAllByTestId("plan-dish");
    expect(within(dishes[0]).getByRole("link", { name: "Tacos" })).toHaveAttribute("href", `/recept/${tacos.id}`);
    expect(within(dishes[0]).getByTestId("dish-note")).toHaveTextContent("4 varor att köpa");
    // UX-20: "N varor att köpa" always first, the offers as tags on a line of their own.
    expect(within(dishes[1]).getByTestId("dish-note")).toHaveTextContent("3 varor att köpa");
    expect(within(dishes[1]).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Falukorv 2 för 50 kr", "Grädde 19 kr/st"]);
    expect(within(dishes[0]).queryByTestId("offer-tag")).not.toBeInTheDocument();
  });

  it("removes with the bin at once and offers Ångra, which puts it back", async () => {
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
    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByTestId("plan-dish")).toBeInTheDocument();
  });

  it("says dishes and items to buy under Veckans rätter, with no button of its own to the list (the tab bar goes there)", () => {
    renderPlanner([onWeek(1, "Tacos"), onWeek(2, "Korvstroganoff")], options, 6);
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("2 rätter · 6 varor att köpa");
    expect(screen.queryByRole("link", { name: "Inköpslistan" })).not.toBeInTheDocument();
  });
});

describe("WeekPlanner as a calendar of the week", () => {
  it("shows each dish's day and date in a column and the free days as rows", () => {
    renderPlanner([onWeek(1, "Tacos", 1), onWeek(2, "Korvstroganoff", 3)]);
    const [mon, wed] = screen.getAllByTestId("dish-day");
    expect(mon).toHaveTextContent("Mån2/11");
    expect(wed).toHaveTextContent("Ons4/11");
    expect(screen.getAllByTestId("free-day").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Lägg till en rätt på tisdag",
      "Lägg till en rätt på torsdag",
      "Lägg till en rätt på fredag",
      "Lägg till en rätt på lördag",
      "Lägg till en rätt på söndag",
    ]);
  });

  it("leaves out free days before today", () => {
    renderPlanner([onWeek(1, "Tacos", 1)], options, 0, 4);
    expect(screen.getAllByTestId("free-day")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Lägg till en rätt på tisdag" })).not.toBeInTheDocument();
  });

  it("lists dishes with no day last, under Ingen dag", () => {
    renderPlanner([onWeek(1, "Tacos", null), onWeek(2, "Korvstroganoff", 2)]);
    const titles = screen.getAllByTestId("plan-dish").map((row) => row.textContent);
    expect(titles[0]).toContain("Korvstroganoff");
    expect(titles.at(-1)).toContain("Tacos");
    expect(screen.getByTestId("no-day-label")).toHaveTextContent("Ingen dag");
  });

  it("shows the day on the first of several dishes on one day", () => {
    renderPlanner([onWeek(1, "Tacos", 2), onWeek(2, "Korvstroganoff", 2)]);
    const [first, second] = screen.getAllByTestId("dish-day");
    expect(first).toHaveTextContent("Tis3/11");
    expect(second).not.toHaveTextContent("Tis");
  });

  it("puts the next + on a free day that was tapped, then clears it", async () => {
    const user = userEvent.setup();
    renderPlanner([onWeek(2, "Korvstroganoff", 1)]);
    await user.click(screen.getByRole("button", { name: "Lägg till en rätt på onsdag" }));
    expect(screen.getByTestId("target-day")).toHaveTextContent("Läggs på onsdag");
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(addToCurrentPlan).toHaveBeenCalledWith(expect.objectContaining({ recipeId: uuid(1), weekday: 3 }));
    await waitFor(() => expect(screen.queryByTestId("target-day")).not.toBeInTheDocument());
  });

  it("lets the chosen day go with Ta bort dag", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "Lägg till en rätt på tisdag" }));
    await user.click(screen.getByRole("button", { name: "Ta bort dag" }));
    await user.click(screen.getByRole("button", { name: "Lägg Tacos på veckan" }));
    expect(addToCurrentPlan.mock.calls.at(-1)?.[0]).not.toHaveProperty("weekday");
  });
});
