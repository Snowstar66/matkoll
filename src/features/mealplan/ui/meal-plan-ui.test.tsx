import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import type { RecipeListItem } from "@/features/recipes";
import { fail, ok, type Result } from "@/lib/errors";
import type { AddToPlanInput, PlanDish, PlanRecipeRow, ServingsChange } from "../domain/meal-plan";
import { AddDishButton, AddDishProvider, type SearchRecipes } from "./add-dish-sheet";
import { MealPlanList } from "./meal-plan-list";

// Matsedel's dishes and the sheet Lägg till rätt (Story 3.1), with the
// actions stubbed; `serverUpdate` changes the server's dishes, as a
// revalidation would.

const addToCurrentPlan = vi.fn<(input: AddToPlanInput) => Promise<Result<PlanRecipeRow>>>();
const setServings = vi.fn<(change: ServingsChange) => Promise<Result<ServingsChange>>>();
const removePlanRecipe = vi.fn<(id: string) => Promise<Result<PlanRecipeRow>>>();
const restorePlanRecipe = vi.fn<(row: PlanRecipeRow) => Promise<Result<PlanRecipeRow>>>();
vi.mock("../actions/add-to-current-plan", () => ({
  addToCurrentPlan: (input: AddToPlanInput) => addToCurrentPlan(input),
}));
vi.mock("../actions/set-servings", () => ({ setServings: (change: ServingsChange) => setServings(change) }));
vi.mock("../actions/remove-plan-recipe", () => ({ removePlanRecipe: (id: string) => removePlanRecipe(id) }));
vi.mock("../actions/restore-plan-recipe", () => ({
  restorePlanRecipe: (row: PlanRecipeRow) => restorePlanRecipe(row),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const planId = "99999999-9999-4999-8999-999999999999";
const milk = "77777777-7777-4777-8777-777777777777";
const dish = (n: number, title: string, overrides: Partial<PlanDish> = {}): PlanDish => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-4${n}${n}${n}-8${n}${n}${n}-${String(n).repeat(12)}`,
  recipeId: `${n}${n}${n}${n}${n}${n}${n}${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  recipeTitle: title,
  servings: 4,
  position: n,
  recipe: {
    imageUrl: null,
    totalMinutes: 30,
    originalServings: 4,
    lines: [{ id: `line-${n}`, ingredientId: milk, amount: 4, unit: "dl", isVague: false }],
  },
  ...overrides,
});
const pasta = dish(1, "Pasta");
const soppa = dish(2, "Soppa");
const gryta = dish(3, "Gryta");
const gone = dish(4, "Gammal gryta", { recipeId: null, recipe: null });
const known = [pasta, soppa, gryta, gone];
const rowOf = ({ id, recipeId, recipeTitle, servings, position }: PlanDish): PlanRecipeRow => ({
  id,
  mealPlanId: planId,
  recipeId,
  recipeTitle,
  servings,
  position,
});
/** 4 dl milk at home: enough for 4 servings of each dish, not for 5. */
const snapshot = toSnapshot([{ ingredientId: milk, amount: 4, unit: "dl" }]);

let serverUpdate: (update: (dishes: PlanDish[]) => PlanDish[]) => void = () => {};

function Matsedel({ initial, recipes = [] }: { initial: PlanDish[]; recipes?: RecipeListItem[] | null }) {
  const [dishes, setDishes] = useState(initial);
  useEffect(() => {
    serverUpdate = (update) => setDishes(update);
  }, []);
  return (
    <ToastProvider>
      <AddDishProvider recipes={recipes} searchRecipes={searchRecipes}>
        <AddDishButton variant="icon" />
        <MealPlanList planName="Vecka 44" dishes={dishes} snapshot={snapshot} />
      </AddDishProvider>
    </ToastProvider>
  );
}

const searchRecipes = vi.fn<SearchRecipes>();
const cards = () => screen.queryAllByTestId("plan-dish");
const card = (title: string) => cards().find((element) => element.textContent?.includes(title))!;
const toast = () => screen.getByTestId("toast");

beforeEach(() => {
  addToCurrentPlan.mockReset();
  setServings.mockReset().mockImplementation(async (change) => ok(change));
  removePlanRecipe.mockReset().mockImplementation(async (id) => ok(rowOf(known.find((d) => d.id === id)!)));
  restorePlanRecipe.mockReset().mockImplementation(async (row) => ok(row));
  searchRecipes.mockReset().mockResolvedValue(ok([]));
  refresh.mockReset();
});

describe("MealPlanList", () => {
  it("shows the empty plan with Lägg till rätt", () => {
    render(<Matsedel initial={[]} />);
    expect(screen.getByText("Ingen rätt på matsedeln än.")).toBeInTheDocument();
    // "+" (the header's, here) and the empty state's button.
    expect(screen.getAllByRole("button", { name: "Lägg till rätt" })).toHaveLength(2);
  });

  it("shows each dish with its servings and its status in words for those servings", async () => {
    const user = userEvent.setup();
    // The save revalidates Matsedel: the server's plan has the new servings.
    setServings.mockImplementation(async (change) => {
      serverUpdate((dishes) => dishes.map((d) => (d.id === change.id ? { ...d, servings: change.servings } : d)));
      return ok(change);
    });
    render(<Matsedel initial={[pasta, soppa]} />);
    expect(screen.getByTestId("plan-name")).toHaveTextContent("Vecka 44");
    expect(within(card("Pasta")).getByText("4 portioner")).toBeInTheDocument();
    expect(within(card("Pasta")).getByText("Kan lagas nu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    expect(within(card("Pasta")).getByText("5 portioner")).toBeInTheDocument();
    expect(within(card("Pasta")).getByText("Saknar 1 vara")).toBeInTheDocument();
    expect(setServings).toHaveBeenCalledWith({ id: pasta.id, servings: 5 });
  });

  it("puts the saved servings back and says so when saving fails", async () => {
    const user = userEvent.setup();
    setServings.mockResolvedValue(fail("mealplan_servings_failed"));
    render(<Matsedel initial={[pasta]} />);
    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    expect(await within(card("Pasta")).findByText("4 portioner")).toBeInTheDocument();
    expect(toast()).toHaveTextContent("Det gick inte att spara portionerna.");
  });

  it("removes a dish at once and puts it back with the same id on Ångra", async () => {
    render(<Matsedel initial={[pasta, soppa]} />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta från matsedeln" }), { detail: 1 }),
    );
    expect(cards()).toHaveLength(1);
    expect(toast()).toHaveTextContent("Pasta är borttagen från matsedeln.");
    // The server's plan catches up; Ångra puts the same row back.
    act(() => serverUpdate((dishes) => dishes.filter((other) => other.id !== pasta.id)));
    await act(async () => fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" })));
    expect(restorePlanRecipe).toHaveBeenCalledWith(rowOf(pasta));
    expect(cards().map((element) => element.dataset.dish)).toEqual([pasta.id, soppa.id]);
  });

  it("gathers dishes removed while the confirmation shows", async () => {
    render(<Matsedel initial={[pasta, soppa]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta" }), { detail: 1 }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Soppa" }), { detail: 1 }));
    expect(toast()).toHaveTextContent("Pasta och Soppa är borttagna från matsedeln.");
    expect(screen.getByText("Ingen rätt på matsedeln än.")).toBeInTheDocument();
  });

  it("brings the dish back when the removal fails", async () => {
    removePlanRecipe.mockResolvedValue(fail("mealplan_remove_failed"));
    render(<Matsedel initial={[pasta]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta" }), { detail: 1 }));
    expect(cards()).toHaveLength(1);
    expect(toast()).toHaveTextContent("Det gick inte att ta bort rätten.");
  });

  it("shows a dish whose recipe is gone by its title, without status", () => {
    render(<Matsedel initial={[dish(3, "Gammal gryta", { recipeId: null, recipe: null })]} />);
    expect(within(card("Gammal gryta")).getByText("Borttaget recept")).toBeInTheDocument();
    expect(within(card("Gammal gryta")).queryByText(/Kan lagas nu|Saknar/)).toBeNull();
  });
});

describe("Lägg till rätt", () => {
  const recipe = (id: string, title: string, isFavorite: boolean): RecipeListItem => ({
    id,
    title,
    imageUrl: null,
    totalMinutes: 20,
    originalServings: 2,
    isFavorite,
    createdAt: "2026-10-01T08:00:00+00:00",
    missingCount: 0,
  });
  const gryta = recipe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "Krämig kycklinggryta", true);
  const openSheet = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    return screen.getByRole("dialog", { name: "Lägg till rätt" });
  };
  const lasagne = recipe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Lasagne", false);

  it("lists the favourites first; a tap adds the recipe and closes the sheet", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(ok(rowOf(pasta)));
    render(<Matsedel initial={[]} recipes={[lasagne, gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    const favorites = within(sheet).getByRole("region", { name: "Favoriter" });
    expect(within(favorites).getAllByTestId("dish-choice").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Krämig kycklinggryta"),
    ]);
    expect(within(sheet).getByRole("region", { name: "Övriga recept" })).toHaveTextContent("Lasagne");

    await user.click(within(favorites).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(addToCurrentPlan).toHaveBeenCalledWith({ recipeId: gryta.id, id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    // The sheet closes, and the toast shows, once the answer has settled.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Lägg till rätt" })).toBeNull());
    expect(toast()).toHaveTextContent("Lagt på matsedeln.");
  });

  it("searches the library under the favourites", async () => {
    const user = userEvent.setup();
    searchRecipes.mockResolvedValue(ok([lasagne]));
    render(<Matsedel initial={[]} recipes={[lasagne, gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    await user.type(within(sheet).getByRole("searchbox", { name: "Sök recept" }), "lasagne{Enter}");
    expect(searchRecipes).toHaveBeenCalledWith("lasagne");
    expect(await within(sheet).findByRole("region", { name: "Sökresultat" })).toHaveTextContent("Lasagne");
    expect(within(sheet).getByRole("region", { name: "Favoriter" })).toBeInTheDocument();
  });

  it("stays open with the reason when the dish cannot be added", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(fail("mealplan_add_failed"));
    render(<Matsedel initial={[]} recipes={[gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: "Lägg till rätt" });
    await user.click(within(sheet).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Det gick inte att lägga rätten på matsedeln.");
  });

  it("tries again with the same dish id, so a lost answer never adds the dish twice", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockRejectedValueOnce(new Error("no answer")).mockResolvedValue(ok(rowOf(pasta)));
    render(<Matsedel initial={[]} recipes={[gryta, lasagne]} />);
    const sheet = await openSheet(user);
    await user.click(within(sheet).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Det gick inte att lägga rätten på matsedeln.");
    await user.click(within(sheet).getByRole("button", { name: /Krämig kycklinggryta/ }));
    const [first, retry] = addToCurrentPlan.mock.calls.map(([input]) => input.id);
    expect(retry).toBe(first);
    // The next tap is a new dish.
    await openSheet(user);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Lasagne/ }));
    expect(addToCurrentPlan.mock.calls[2][0].id).not.toBe(first);
  });

  it("starts afresh each time it opens, without the last search or error", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(fail("mealplan_add_failed"));
    searchRecipes.mockResolvedValue(ok([lasagne]));
    render(<Matsedel initial={[]} recipes={[gryta, lasagne]} />);
    let sheet = await openSheet(user);
    await user.type(within(sheet).getByRole("searchbox", { name: "Sök recept" }), "lasagne{Enter}");
    await within(sheet).findByRole("region", { name: "Sökresultat" });
    await user.click(within(sheet).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Klar" }));

    sheet = await openSheet(user);
    expect(within(sheet).queryByRole("alert")).toBeNull();
    expect(within(sheet).getByRole("searchbox", { name: "Sök recept" })).toHaveValue("");
    expect(within(sheet).getByRole("region", { name: "Övriga recept" })).toHaveTextContent("Lasagne");
  });

  it("says so when the library could not be read, and the plan is still shown", async () => {
    const user = userEvent.setup();
    render(<Matsedel initial={[pasta]} recipes={null} />);
    expect(cards()).toHaveLength(1);
    const sheet = await openSheet(user);
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att läsa recepten. Försök igen.");
  });
});

describe("more on servings and removal", () => {
  /** A promise resolved from the test, to see the plan while an action waits. */
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => (resolve = done));
    return { promise, resolve };
  }

  it("saves a quick series of taps one at a time, ending with the last value", async () => {
    const user = userEvent.setup();
    const first = deferred<Result<ServingsChange>>();
    setServings.mockImplementationOnce(() => first.promise);
    render(<Matsedel initial={[pasta]} />);
    const more = screen.getByRole("button", { name: "Fler portioner, Pasta" });
    await user.click(more);
    await user.click(more);
    await user.click(more);
    expect(within(card("Pasta")).getByText("7 portioner")).toBeInTheDocument();
    // One write at a time: the later taps wait for the first.
    expect(setServings).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve(ok({ id: pasta.id, servings: 5 })));
    const saved = setServings.mock.calls.map(([change]) => change.servings);
    expect(saved[0]).toBe(5);
    expect(saved.at(-1)).toBe(7);
    expect(saved.length).toBeLessThanOrEqual(3);
  });

  it("says nothing about failed servings for a dish being removed, so its Ångra stays", async () => {
    const user = userEvent.setup();
    const write = deferred<Result<ServingsChange>>();
    setServings.mockImplementationOnce(() => write.promise);
    render(<Matsedel initial={[pasta, soppa]} />);
    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta från matsedeln" }), { detail: 1 }),
    );
    await act(async () => write.resolve(fail("mealplan_servings_failed")));
    expect(toast()).toHaveTextContent("Pasta är borttagen från matsedeln.");
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });

  it("puts every dish removed under one confirmation back with Ångra", async () => {
    render(<Matsedel initial={[pasta, soppa, gryta]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta" }), { detail: 1 }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Soppa" }), { detail: 1 }));
    expect(cards()).toHaveLength(1);
    await act(async () => fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" })));
    expect(restorePlanRecipe.mock.calls.map(([row]) => row.id).sort()).toEqual([pasta.id, soppa.id].sort());
    expect(cards().map((element) => element.dataset.dish)).toEqual([pasta.id, soppa.id, gryta.id]);
  });

  it("shows a dish whose recipe could not be read by its stored title, as a link, without status", () => {
    render(<Matsedel initial={[dish(5, "Okänd soppa", { recipe: null })]} />);
    expect(within(card("Okänd soppa")).getByRole("link", { name: "Okänd soppa" })).toBeInTheDocument();
    expect(within(card("Okänd soppa")).queryByText("Borttaget recept")).toBeNull();
    expect(within(card("Okänd soppa")).queryByText(/Kan lagas nu|Saknar/)).toBeNull();
  });
});

describe("focus after a removal", () => {
  const keyboardRemove = (title: string) =>
    act(async () => {
      const action = screen.getByRole("button", { name: `Ta bort ${title}` });
      action.focus();
      fireEvent.click(action, { detail: 0 });
    });

  it("goes to the next dish, else the one before, else Lägg till rätt", async () => {
    render(<Matsedel initial={[pasta, soppa, gryta]} />);
    await keyboardRemove("Soppa");
    expect(screen.getByRole("link", { name: "Gryta" })).toHaveFocus();
    await keyboardRemove("Gryta");
    expect(screen.getByRole("link", { name: "Pasta" })).toHaveFocus();
    await keyboardRemove("Pasta");
    expect(screen.getByText("Ingen rätt på matsedeln än.")).toBeInTheDocument();
    const add = screen.getAllByRole("button", { name: "Lägg till rätt" }).find((button) => button.textContent === "Lägg till rätt");
    expect(add).toHaveFocus();
  });

  it("goes to the card's Ta bort for a dish whose recipe is gone, and after the card's own button too", async () => {
    render(<Matsedel initial={[pasta, gone]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta från matsedeln" })));
    expect(screen.getByRole("button", { name: "Ta bort Gammal gryta från matsedeln" })).toHaveFocus();
  });

  it("stays put after a tap on the swipe action", async () => {
    render(<Matsedel initial={[pasta, soppa]} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort Pasta" }), { detail: 1 }));
    expect(screen.getByRole("link", { name: "Soppa" })).not.toHaveFocus();
  });
});
