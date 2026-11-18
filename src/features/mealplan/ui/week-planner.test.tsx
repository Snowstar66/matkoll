import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { PlanOption } from "@/features/suggestions";
import type { PlanDish, PlanRecipeRow } from "../domain/meal-plan";
import { AddDishesButton } from "./add-dishes-button";
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

/** "Alla recept" is no chip: it is every chip off, so the one that is on is tapped again. */
const showAll = async (user: ReturnType<typeof userEvent.setup>) => {
  for (const name of ["Snabbt", "Favoriter", "På erbjudande"]) {
    const chip = screen.getByRole("button", { name });
    if (chip.getAttribute("aria-pressed") === "true") await user.click(chip);
  }
};

const rowTitles = () => screen.queryAllByTestId("plan-option").map((row) => row.querySelector("p")?.textContent);

afterEach(() => window.localStorage.removeItem("livskoll-option-showFit"));

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

describe("WeekPlanner, read later", () => {
  it("shows the week at once and the library and the count when they have been read", async () => {
    let done!: (value: PlanOption[] | null) => void;
    const optionsLater = new Promise<PlanOption[] | null>((resolve) => {
      done = resolve;
    });
    await act(async () => {
      render(
        <ToastProvider>
          <WeekPlanner weekStart="2026-11-02" dishes={[onWeek(1, "Tacos", 2)]} optionsLater={optionsLater} toBuyLater={Promise.resolve(3)} />
        </ToastProvider>,
      );
    });
    expect(screen.getByTestId("plan-dish")).toHaveTextContent("Tacos");
    expect(screen.getByTestId("options-loading")).toBeInTheDocument();
    expect(screen.getByTestId("week-bar-count")).toHaveTextContent("3 varor att köpa");
    await act(async () => done(options));
    expect(screen.queryByTestId("options-loading")).not.toBeInTheDocument();
    // Favoriter is the tab when there are favorites, known only now.
    expect(screen.getByRole("button", { name: "Favoriter" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("WeekPlanner, the tabs", () => {
  it("starts on Favoriter with the most cooked first, with meta and the offer line", () => {
    renderPlanner();
    expect(screen.getByRole("button", { name: "Favoriter" })).toHaveAttribute("aria-pressed", "true");
    expect(rowTitles()).toEqual(["Tacos", "Korvstroganoff"]);
    const korvRow = screen.getAllByTestId("plan-option")[1];
    expect(korvRow).toHaveTextContent("Favorit · 30 min");
    expect(within(korvRow).getAllByTestId("offer-tag").map((tag) => tag.textContent)).toEqual(["Falukorv 2 för 50 kr", "Grädde 19 kr/st"]);
    expect(screen.getAllByTestId("plan-option")[0]).toHaveTextContent("Favorit · lagad 9 gånger");
  });

  it("På erbjudande lists only recipes with an offer, most saved first, with the hint and the ideas footer", async () => {
    const user = userEvent.setup();
    renderPlanner();
    await user.click(screen.getByRole("button", { name: "På erbjudande" }));
    expect(rowTitles()).toEqual(["Korvstroganoff", "Laxpasta"]);
    expect(screen.getByTestId("offers-hint")).toHaveTextContent("Förslag för att varorna är på erbjudande den här veckan.");
    expect(screen.getByText("Idéer")).toBeVisible();
    await showAll(user);
    expect(rowTitles()).toEqual(["Korvstroganoff", "Laxpasta", "Linssoppa", "Tacos"]);
    expect(screen.getByText("Idéer")).not.toBeVisible();
  });

  it("falls back to Alla recept without favourites, and says when a tab is empty", async () => {
    const user = userEvent.setup();
    renderPlanner([], [soppa]);
    expect(screen.queryAllByRole("button", { pressed: true }).filter((chip) => ["Snabbt", "Favoriter", "På erbjudande"].includes(chip.textContent ?? ""))).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "På erbjudande" }));
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
    expect(screen.queryByRole("button", { name: "Favoriter" })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Favoriter" })).toBeVisible();
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

  it("opens for this visit only when the header's + says so (UX-07)", async () => {
    window.localStorage.setItem("matkoll.mealplan.library-open", "0");
    const user = userEvent.setup();
    renderPlanner();
    expect(screen.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "false");
    render(<AddDishesButton />);
    await user.click(screen.getByRole("button", { name: "Lägg till rätt" }));
    expect(screen.getByRole("button", { name: "Lägg till nya rätter" })).toHaveAttribute("aria-expanded", "true");
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
    await user.click(within(dialog).getByRole("button", { name: /^Onsdag 4 nov/ }));
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
      "Torsdag 5 nov",
      "Fredag 6 nov · Korvstroganoff",
      "Lördag 7 nov",
      "Söndag 8 nov",
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
    await user.click(within(dialog).getByRole("button", { name: /^Måndag 2 nov/ }));
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
    expect(mon).toHaveTextContent("Mån2 nov");
    expect(wed).toHaveTextContent("Ons4");
    expect(screen.getAllByTestId("free-day").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Lägg till en rätt på tisdag",
      "Lägg till en rätt på torsdag",
      "Lägg till en rätt på fredag",
      "Lägg till en rätt på lördag",
      "Lägg till en rätt på söndag",
    ]);
  });

  it("shows a free day as a plus without words, still a button", () => {
    renderPlanner([onWeek(1, "Tacos", 1)]);
    const [tuesday] = screen.getAllByTestId("free-day");
    expect(tuesday).toHaveTextContent("Tis3");
    expect(tuesday).not.toHaveTextContent(/Ledig|lägg till/i);
    expect(tuesday.querySelector("svg")).not.toBeNull();
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
    expect(first).toHaveTextContent("Tis3");
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

describe("WeekPlanner, Hushållets preferenser", () => {
  const fitsFor = { [uuid(1)]: [{ kind: "allergy" as const, text: "Kan innehålla gluten (Anna)" }, { kind: "dislike" as const, text: "Anna undviker lök" }, { kind: "like" as const, text: "Anna älskar ost" }] };

  it("flags a dish with at most two notes, allergy first, and keeps the dish; the week line links to it", () => {
    window.localStorage.setItem("livskoll-option-showFit", "text");
    render(
      <ToastProvider>
        <WeekPlanner weekStart="2026-11-02" dishes={[onWeek(1, "Tacos", 2), onWeek(2, "Korvstroganoff", null)]} options={options} toBuy={0} fits={fitsFor} />
      </ToastProvider>,
    );
    const rows = screen.getAllByTestId("plan-dish");
    expect(rows).toHaveLength(2);
    const notes = within(rows[0]).getByTestId("preference-notes");
    expect([...notes.querySelectorAll("[data-kind]")].map((n) => n.textContent)).toEqual(["Kan innehålla gluten (Anna)", "Anna undviker lök"]);
    expect(within(rows[1]).queryByTestId("preference-notes")).toBeNull();
    const line = screen.getByTestId("week-allergy-line");
    expect(line).toHaveTextContent("1 rätt på veckan kan innehålla en allergen (Anna)");
    expect(within(line).getByRole("link")).toHaveAttribute("href", `#dish-${uuid(51)}`);
  });

  it("shows nothing extra without preferences, and no week line without an allergy", () => {
    renderPlanner([onWeek(1, "Tacos", 2)]);
    expect(screen.queryByTestId("preference-notes")).toBeNull();
    expect(screen.queryByTestId("week-allergy-line")).toBeNull();
    render(
      <ToastProvider>
        <WeekPlanner weekStart="2026-11-02" dishes={[onWeek(1, "Tacos", 2)]} options={options} toBuy={0} fits={{ [uuid(1)]: [{ kind: "like", text: "Anna älskar ost" }] }} />
      </ToastProvider>,
    );
    expect(screen.queryByTestId("week-allergy-line")).toBeNull();
  });
});


describe("the preview of a dish, Snabbt and how often (Lägg till nya rätter)", () => {
  const history = (weeksAgo: number | null) => ({ lastWeekStart: weeksAgo === null ? null : "2026-09-07", weeksOn: 2, usualWeekday: 4, plannedEver: weeksAgo !== null, historyWeeks: 20 });
  const withFit = option(5, "Gryta", {
    totalMinutes: 55,
    fit: [
      { kind: "allergy", text: "Kan innehålla laktos (Anna)", people: [{ id: "a", name: "Anna" }], terms: ["laktos"] },
      { kind: "dislike", text: "Anna undviker koriander", people: [{ id: "a", name: "Anna" }], terms: ["koriander"] },
    ],
    stats: history(10),
  });

  afterEach(() => {
    window.localStorage.removeItem("livskoll-plan-quick");
    window.localStorage.removeItem("livskoll-option-showHowOften");
    window.localStorage.removeItem("livskoll-option-oftenAfterWeeks");
  });

  async function openAddList() {
    renderPlanner([], [tacos, korv, lax, soppa, withFit]);
    await showAll(userEvent.setup());
  }

  it("opens on a tap on the card with what the row cannot carry, and the + still adds without opening it", async () => {
    const user = userEvent.setup();
    renderPlanner([], options);
    await showAll(user);
    await user.click(screen.getByRole("button", { name: "Visa mer om Korvstroganoff" }));
    const dialog = await screen.findByRole("dialog", { name: "Korvstroganoff" });
    expect(within(dialog).getByTestId("dish-preview-buy")).toHaveTextContent("Saknas hemma: tomat, lök");
    expect(within(dialog).getByTestId("dish-preview-offers")).toHaveTextContent("Falukorv och grädde på erbjudande · −21 kr");
    expect(within(dialog).getByTestId("dish-preview-offers")).toHaveTextContent("Falukorv 2 för 50 kr");
    expect(within(dialog).getByTestId("dish-preview-offers")).toHaveTextContent("Grädde 19 kr/st");
    expect(within(dialog).getByRole("link", { name: "Öppna receptet" })).toHaveAttribute("href", `/recept/${uuid(2)}`);
    expect(addToCurrentPlan).not.toHaveBeenCalled();
  });

  it("adds the dish from the sheet, on the free day that was tapped", async () => {
    const user = userEvent.setup();
    renderPlanner([], options, 0, 1);
    await showAll(user);
    await user.click(screen.getByRole("button", { name: "Visa mer om Tacos" }));
    await user.click(await screen.findByTestId("dish-preview-add"));
    await waitFor(() => expect(addToCurrentPlan).toHaveBeenCalledWith(expect.objectContaining({ recipeId: uuid(1) })));
  });

  it("shows the household's allergy in red on top of the sheet and the other notes under Hushållet", async () => {
    const user = userEvent.setup();
    await openAddList();
    await user.click(screen.getByRole("button", { name: "Visa mer om Gryta" }));
    const dialog = await screen.findByRole("dialog", { name: "Gryta" });
    expect(within(dialog).getByTestId("dish-preview-allergy")).toHaveTextContent("Kan innehålla laktos (Anna)");
    expect(within(dialog).getByTestId("dish-preview-fit")).toHaveTextContent("Anna undviker koriander");
  });

  it("has På menyn only with Visa hur ofta on", async () => {
    const user = userEvent.setup();
    await openAddList();
    await user.click(screen.getByRole("button", { name: "Visa mer om Gryta" }));
    expect(screen.queryByTestId("dish-preview-menu")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Klar" }));
    window.localStorage.setItem("livskoll-option-showHowOften", "1");
    window.dispatchEvent(new Event("livskoll-option-changed"));
    await user.click(await screen.findByRole("button", { name: "Visa mer om Gryta" }));
    const menu = await screen.findByTestId("dish-preview-menu");
    expect(menu).toHaveTextContent("På menyn 2 av de senaste 12 veckorna");
    expect(menu).toHaveTextContent("Oftast torsdagar");
  });

  it("puts the quiet chip on a dish that has not been on the menu for the chosen number of weeks, and nothing without the Tillval", async () => {
    const stale = option(6, "Pytt", { stats: history(10) });
    const fresh = option(7, "Pasta", { stats: { ...history(2), lastWeekStart: "2026-11-02" } });
    const never = option(8, "Nytt recept", { stats: history(null) });
    const { rerender } = render(
      <ToastProvider>
        <WeekPlanner weekStart="2026-11-02" dishes={[]} options={[stale, fresh, never]} toBuy={0} />
      </ToastProvider>,
    );
    await showAll(userEvent.setup());
    expect(screen.queryByTestId("menu-chip")).not.toBeInTheDocument();
    window.localStorage.setItem("livskoll-option-showHowOften", "1");
    window.dispatchEvent(new Event("livskoll-option-changed"));
    rerender(
      <ToastProvider>
        <WeekPlanner weekStart="2026-11-02" dishes={[]} options={[stale, fresh, never]} toBuy={0} />
      </ToastProvider>,
    );
    const chips = await screen.findAllByTestId("menu-chip");
    expect(chips.map((chip) => chip.textContent)).toContain("Aldrig planerad");
    expect(chips.some((chip) => /^Inte på menyn \d+ veckor$/.test(chip.textContent ?? ""))).toBe(true);
  });

  it("filters on Snabbt (at most 30 minutes, no time is not quick), one chip at a time, a second tap switches it off", async () => {
    const user = userEvent.setup();
    const slow = option(9, "Gryta", { totalMinutes: 90 });
    const noTime = option(10, "Okänd", { totalMinutes: null });
    const quickOne = option(11, "Omelett", { totalMinutes: 15 });
    renderPlanner([], [slow, noTime, quickOne]);
    await showAll(user);
    expect(rowTitles()).toHaveLength(3);
    const chip = screen.getByTestId("plan-quick");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(rowTitles()).toEqual(["Omelett"]);
    // One chip at a time: another chip takes Snabbt off.
    await user.click(screen.getByRole("button", { name: "Favoriter" }));
    expect(screen.getByTestId("plan-quick")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Favoriter" })).toHaveAttribute("aria-pressed", "true");
    // A second tap on a chip that is on switches it off: every recipe again.
    await user.click(screen.getByTestId("plan-quick"));
    await user.click(screen.getByTestId("plan-quick"));
    expect(rowTitles()).toHaveLength(3);
  });

  it("says there are no quick dishes, with a way to show all", async () => {
    const user = userEvent.setup();
    renderPlanner([], [option(12, "Gryta", { totalMinutes: 90 })]);
    await showAll(user);
    await user.click(screen.getByTestId("plan-quick"));
    expect(screen.getByTestId("options-empty")).toHaveTextContent("Inga snabba rätter här.");
    await user.click(screen.getByRole("button", { name: "Visa alla" }));
    expect(rowTitles()).toEqual(["Gryta"]);
  });
});
