import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import type { RecipeListItem } from "@/features/recipes";
import { fail, ok, type Result } from "@/lib/errors";
import type { AddToPlanInput, PlanDish, PlanRecipeRow, ServingsChange, WeekdayChange } from "../domain/meal-plan";
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
const setWeekday = vi.fn<(change: WeekdayChange) => Promise<Result<WeekdayChange>>>();
vi.mock("../actions/set-weekday", () => ({ setWeekday: (change: WeekdayChange) => setWeekday(change) }));
vi.mock("../actions/set-servings", () => ({ setServings: (change: ServingsChange) => setServings(change) }));
vi.mock("../actions/remove-plan-recipe", () => ({ removePlanRecipe: (id: string) => removePlanRecipe(id) }));
vi.mock("../actions/restore-plan-recipe", () => ({
  restorePlanRecipe: (row: PlanRecipeRow) => restorePlanRecipe(row),
}));
const markDishCooked = vi.fn();
vi.mock("../actions/mark-dish-cooked", () => ({ markDishCooked: (input: unknown) => markDishCooked(input) }));
vi.mock("../actions/undo-dish-cooked", () => ({ undoDishCooked: vi.fn() }));
// The question before a removal has its own tests (meal-plan-remove-confirm.test.tsx);
// here the grace window is open, so a removal goes straight through.
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
const dayRow = (day: number) => screen.getAllByTestId("plan-day").find((element) => element.dataset.day === String(day))!;
/** Opens the ⋯ sheet of a dish. */
const openMore = (title: string) =>
  act(async () => fireEvent.click(screen.getByRole("button", { name: `Fler val för ${title}` })));
/** "Ta bort från matsedeln" in the dish's ⋯ sheet; within the grace window it removes at once. */
async function removeFromSheet(title: string, detail = 1) {
  await openMore(title);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort från matsedeln" }), { detail }));
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  // Thursday 29 October 2026, in Stockholm.
  vi.useFakeTimers({ now: new Date("2026-10-29T10:00:00Z"), toFake: ["Date"] });
  setWeekday.mockReset().mockImplementation(async (change) => ok(change));
  addToCurrentPlan.mockReset();
  setServings.mockReset().mockImplementation(async (change) => ok(change));
  removePlanRecipe.mockReset().mockImplementation(async (id) => ok(rowOf(known.find((d) => d.id === id)!)));
  restorePlanRecipe.mockReset().mockImplementation(async (row) => ok(row));
  searchRecipes.mockReset().mockResolvedValue(ok([]));
  refresh.mockReset();
});

describe("MealPlanList", () => {
  it("offers next week in the empty plan when it has dishes (Story 19.6)", () => {
    render(
      <ToastProvider>
        <AddDishProvider recipes={[]} searchRecipes={searchRecipes}>
          <MealPlanList planName={null} dishes={[]} snapshot={snapshot} weekStart="2026-10-26" nextWeek={{ weekStart: "2026-11-02", count: 2 }} />
        </AddDishProvider>
      </ToastProvider>,
    );
    expect(screen.getByText("Rätterna du lägger här blir din inköpslista.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nästa vecka har 2 rätter/ })).toHaveAttribute("href", "/matsedel?vecka=2026-W45");
  });

  it("shows the empty plan with Lägg till rätt", () => {
    render(<Matsedel initial={[]} />);
    expect(screen.getByText("Den här veckan är tom.")).toBeInTheDocument();
    // "+" (the header's, here) and the empty state's button.
    expect(screen.getAllByRole("button", { name: "Lägg till rätt" })).toHaveLength(2);
  });

  it("groups the dishes by day with Ingen dag än last, marks today, leaves out passed empty days and keeps empty days compact", () => {
    render(<Matsedel initial={[dish(1, "Pasta", { weekday: 4, position: 5 }), dish(2, "Soppa", { weekday: 4, position: 2 }), dish(3, "Gryta")]} />);
    const days = screen.getAllByTestId("plan-day");
    // Thursday is today: Monday to Wednesday have passed with nothing on them.
    expect(days.map((day) => day.getAttribute("data-day"))).toEqual(["4", "5", "6", "7", "none"]);
    expect(within(days[0]).getAllByRole("link").map((link) => link.textContent)).toEqual(["Soppa", "Pasta"]);
    expect(days[0]).toHaveAttribute("data-today", "true");
    expect(within(days[0]).getAllByText("Idag")).toHaveLength(2);
    expect(days[0]).toHaveAttribute("aria-current", "date");
    // The day is on the first row only: "Tor" and "29".
    expect(within(days[0]).getAllByText("Tor")).toHaveLength(1);
    expect(within(days[0]).getAllByText("29")).toHaveLength(1);
    expect(days[0]).toHaveTextContent("Torsdag 29 okt");
    expect(days[1]).not.toHaveAttribute("data-today");
    expect(days[1]).not.toHaveAttribute("aria-current");
    expect(within(days[1]).getByTestId("day-free")).toHaveTextContent("Fre30+ Lägg till");
    expect(within(days[4]).getByRole("list", { name: "Ingen dag än" })).toBeInTheDocument();
    expect(within(days[4]).getByTestId("plan-dish")).toHaveTextContent("Gryta");
  });

  it("shows a passed day with a dish dimmed, 'Lagad?' on an uncooked dish and '✓ Lagad' on a cooked one", () => {
    render(<Matsedel initial={[dish(1, "Pasta", { weekday: 2 }), dish(2, "Soppa", { weekday: 3, cookedAt: "2026-10-28T18:00:00Z" })]} />);
    expect(screen.getAllByTestId("plan-day").map((day) => day.getAttribute("data-day"))).toEqual(["2", "3", "4", "5", "6", "7"]);
    expect(within(card("Pasta")).getByRole("button", { name: "Lagad? Pasta" })).toBeInTheDocument();
    expect(within(card("Soppa")).queryByRole("button", { name: /^Lagad\?/ })).toBeNull();
    expect(within(card("Soppa")).getByTestId("dish-cooked")).toHaveTextContent("✓ Lagad");
    expect(within(card("Pasta")).getByTestId("recipe-image-placeholder").parentElement).toHaveClass("size-tap");
  });

  it("leaves out Ingen dag än when every dish has a day", () => {
    render(<Matsedel initial={[dish(1, "Pasta", { weekday: 5 })]} />);
    expect(screen.getAllByTestId("plan-day").map((day) => day.getAttribute("data-day"))).toEqual(["4", "5", "6", "7"]);
    expect(screen.queryByText("Ingen dag än")).toBeNull();
  });

  it("moves a dish to a day from Flytta till dag, at once, and says so", async () => {
    const user = userEvent.setup();
    setWeekday.mockImplementation(async (change) => {
      serverUpdate((dishes) => dishes.map((d) => (d.id === change.id ? { ...d, weekday: change.weekday } : d)));
      return ok(change);
    });
    render(<Matsedel initial={[pasta]} />);
    await user.click(screen.getByRole("button", { name: "Fler val för Pasta" }));
    expect(screen.getByRole("button", { name: /Flytta till annan dag/ })).toHaveTextContent("Ingen dag");
    await user.click(screen.getByRole("button", { name: /Flytta till annan dag/ }));
    const sheet = screen.getByRole("dialog", { name: "Flytta till dag" });
    expect(within(sheet).getAllByTestId("day-choice").map((b) => b.textContent)).toEqual([
      "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag", "Ingen dag",
    ]);
    expect(within(sheet).getByRole("button", { name: "Ingen dag" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(sheet).getByRole("button", { name: "Fredag" }));
    expect(setWeekday).toHaveBeenCalledWith({ id: pasta.id, weekday: 5 });
    await waitFor(() => expect(toast()).toHaveTextContent("Pasta ligger på fredag."));
    expect(within(dayRow(5)).getByTestId("plan-dish")).toHaveTextContent("Pasta");
  });

  it("puts the dish back and says so when the move fails", async () => {
    const user = userEvent.setup();
    setWeekday.mockResolvedValue(fail("mealplan_weekday_failed"));
    render(<Matsedel initial={[pasta]} />);
    await user.click(screen.getByRole("button", { name: "Fler val för Pasta" }));
    await user.click(screen.getByRole("button", { name: /Flytta till annan dag/ }));
    await user.click(screen.getByRole("button", { name: "Fredag" }));
    await waitFor(() => expect(toast()).toHaveTextContent("Det gick inte att flytta rätten."));
    await waitFor(() =>
      expect(within(screen.getAllByTestId("plan-day").at(-1)!).getByTestId("plan-dish")).toHaveTextContent("Pasta"),
    );
  });

  it("shows each dish card with what is at home for its servings, a hidden meter and the portion selector", async () => {
    const user = userEvent.setup();
    // The save revalidates Matsedel: the server's plan has the new servings.
    setServings.mockImplementation(async (change) => {
      serverUpdate((dishes) => dishes.map((d) => (d.id === change.id ? { ...d, servings: change.servings } : d)));
      return ok(change);
    });
    render(<Matsedel initial={[pasta, soppa]} />);
    expect(screen.getByTestId("plan-name")).toHaveTextContent("Vecka 44");
    const pastaCard = () => within(card("Pasta"));
    expect(pastaCard().getByTestId("dish-meta")).toHaveTextContent(/^30 min · 4 port\.✓ Allt hemma$/);
    expect(pastaCard().getByTestId("dish-status")).toHaveClass("text-mint-ink");
    // Everything at home: no meter.
    expect(pastaCard().queryByTestId("meter")).toBeNull();
    expect(pastaCard().getByRole("link", { name: "Pasta" })).toHaveAttribute("href", `/recept/${pasta.recipeId}`);
    expect(pastaCard().getByTestId("recipe-image-placeholder").parentElement).toHaveClass("size-dish-thumb");
    expect(pastaCard().getByRole("button", { name: "Fler val för Pasta" })).toHaveClass("size-tap");

    await user.click(screen.getByRole("button", { name: "Fler val för Pasta" }));
    expect(pastaCard().getByText("4 portioner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Öppna receptet ›" })).toHaveAttribute("href", `/recept/${pasta.recipeId}`);
    expect(screen.getByRole("dialog", { name: "Pasta" })).toHaveTextContent("Ingen dag än · 30 min");
    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    expect(pastaCard().getByText("5 portioner")).toBeInTheDocument();
    expect(pastaCard().getByTestId("dish-meta")).toHaveTextContent(/^30 min · 5 port\.0 av 1 hemma$/);
    expect(pastaCard().getByTestId("dish-status")).toHaveClass("text-ink-2");
    const meter = pastaCard().getByTestId("meter");
    expect(meter).toHaveAttribute("aria-hidden", "true");
    expect(meter.firstElementChild).toHaveStyle({ width: "0%" });
    expect(setServings).toHaveBeenCalledWith({ id: pasta.id, servings: 5 });
  });

  it("puts the saved servings back and says so when saving fails", async () => {
    const user = userEvent.setup();
    setServings.mockResolvedValue(fail("mealplan_servings_failed"));
    render(<Matsedel initial={[pasta]} />);
    await openMore("Pasta");
    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    expect(await within(card("Pasta")).findByText("4 portioner")).toBeInTheDocument();
    expect(toast()).toHaveTextContent("Det gick inte att spara portionerna.");
  });

  it("removes a dish at once and puts it back with the same id on Ångra", async () => {
    render(<Matsedel initial={[pasta, soppa]} />);
    await removeFromSheet("Pasta");
    expect(cards()).toHaveLength(1);
    expect(toast()).toHaveTextContent("Tog bort Pasta.");
    // The server's plan catches up; Ångra puts the same row back.
    act(() => serverUpdate((dishes) => dishes.filter((other) => other.id !== pasta.id)));
    await act(async () => fireEvent.click(within(toast()).getByRole("button", { name: "Ångra" })));
    expect(restorePlanRecipe).toHaveBeenCalledWith(rowOf(pasta));
    expect(cards().map((element) => element.dataset.dish)).toEqual([pasta.id, soppa.id]);
  });

  it("gathers dishes removed while the confirmation shows", async () => {
    render(<Matsedel initial={[pasta, soppa]} />);
    await removeFromSheet("Pasta");
    await removeFromSheet("Soppa");
    expect(toast()).toHaveTextContent("Tog bort Pasta och Soppa.");
    expect(screen.getByText("Den här veckan är tom.")).toBeInTheDocument();
  });

  it("brings the dish back when the removal fails", async () => {
    removePlanRecipe.mockResolvedValue(fail("mealplan_remove_failed"));
    render(<Matsedel initial={[pasta]} />);
    await removeFromSheet("Pasta");
    expect(cards()).toHaveLength(1);
    expect(toast()).toHaveTextContent("Det gick inte att ta bort rätten.");
  });

  it("shows a dish whose recipe is gone by its title, without status", () => {
    render(<Matsedel initial={[dish(3, "Gammal gryta", { recipeId: null, recipe: null })]} />);
    expect(within(card("Gammal gryta")).getByText("Borttaget recept · 4 port.")).toBeInTheDocument();
    expect(within(card("Gammal gryta")).queryByText(/hemma/)).toBeNull();
    expect(within(card("Gammal gryta")).queryByTestId("meter")).toBeNull();
  });

  it("shows the time alone, without a meter, for a recipe with no catalog ingredient to count", () => {
    const free = dish(5, "Fri soppa", { recipe: { ...pasta.recipe!, lines: [] } });
    render(<Matsedel initial={[free]} />);
    expect(within(card("Fri soppa")).getByTestId("dish-meta")).toHaveTextContent(/^30 min · 4 port\.$/);
    expect(within(card("Fri soppa")).queryByTestId("meter")).toBeNull();
  });

  it("shows the time alone, without a meter, when the pantry could not be read", () => {
    render(
      <ToastProvider>
        <AddDishProvider recipes={[]} searchRecipes={searchRecipes}>
          <MealPlanList planName="Vecka 44" dishes={[pasta]} snapshot={null} />
        </AddDishProvider>
      </ToastProvider>,
    );
    expect(within(card("Pasta")).getByText("30 min · 4 port.")).toBeInTheDocument();
    expect(within(card("Pasta")).queryByText(/hemma/)).toBeNull();
    expect(within(card("Pasta")).queryByTestId("meter")).toBeNull();
  });

  it("has a quiet shopping row above the list instead of big buttons below, and none without dishes", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Matsedel initial={[pasta]} />);
    const list = screen.getByRole("list", { name: "Matsedelsrätter" });
    const row = screen.getByRole("link", { name: /Inköpslista för vecka 44/ });
    expect(row).toHaveAttribute("href", "/lista");
    expect(row).toHaveTextContent("Inköpslista för vecka 44›");
    expect(row.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Visa inköpslistan" })).toBeNull();
    // Only the header's "+" is left.
    const buttons = screen.getAllByRole("button", { name: "Lägg till rätt" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]!);
    expect(screen.getByRole("dialog", { name: /^Lägg till rätt/ })).toBeInTheDocument();
    unmount();

    render(<Matsedel initial={[]} />);
    expect(screen.queryByRole("link", { name: /Inköpslista för vecka/ })).toBeNull();
  });

  it("gives focus back to Lägg till rätt after the sheet, also when a tap did not focus it (Safari)", async () => {
    const user = userEvent.setup();
    render(<Matsedel initial={[pasta]} />);
    const plus = screen.getByRole("button", { name: "Lägg till rätt" });
    // fireEvent.click, unlike user.click, does not move focus first, as a tap in Safari.
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.click(plus);
    });
    const sheet = await screen.findByRole("dialog", { name: /^Lägg till rätt/ });
    await user.click(within(sheet).getByRole("button", { name: "Klar" }));
    await waitFor(() => expect(plus).toHaveFocus());
  });
});

describe("Markera som lagad from the row", () => {
  beforeEach(() => markDishCooked.mockReset().mockResolvedValue(ok({ rows: [] })));

  it("opens from the ⋯ sheet, replacing it, and marks the dish", async () => {
    const user = userEvent.setup();
    render(<Matsedel initial={[pasta]} />);
    await user.click(screen.getByRole("button", { name: "Fler val för Pasta" }));
    await user.click(screen.getByRole("button", { name: "Markera som lagad" }));
    const sheet = await screen.findByRole("dialog", { name: "Markera som lagad" });
    // The sheets never stack: the ⋯ sheet has given way.
    expect(screen.queryByRole("dialog", { name: "Pasta" })).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: /markera lagad|Markera som lagad/ }));
    expect(markDishCooked).toHaveBeenCalledWith(expect.objectContaining({ dishId: pasta.id }));
  });

  it("opens from Lagad? on an uncooked dish of a passed day", async () => {
    const user = userEvent.setup();
    render(<Matsedel initial={[dish(1, "Pasta", { weekday: 2 })]} />);
    await user.click(screen.getByRole("button", { name: "Lagad? Pasta" }));
    expect(await screen.findByRole("dialog", { name: "Markera som lagad" })).toBeInTheDocument();
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
    return screen.getByRole("dialog", { name: /^Lägg till rätt/ });
  };
  const lasagne = recipe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "Lasagne", false);

  it("lists the favourites first; a tap adds the recipe and closes the sheet", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(ok(rowOf(pasta)));
    render(<Matsedel initial={[]} recipes={[lasagne, gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: /^Lägg till rätt/ });
    const favorites = within(sheet).getByRole("region", { name: "Favoriter" });
    expect(within(favorites).getAllByTestId("dish-choice").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Krämig kycklinggryta"),
    ]);
    expect(within(sheet).getByRole("region", { name: "Övriga recept" })).toHaveTextContent("Lasagne");

    // The day starts on the first free day from today: Thursday 29 Oct 2026 with an empty plan.
    expect(within(sheet).getByRole("radio", { name: "Torsdag" })).toBeChecked();
    expect(sheet).toHaveAccessibleName("Lägg till rätt på torsdag");
    expect(within(sheet).queryByRole("link", { name: "Välj recept" })).toBeNull();
    await user.click(within(favorites).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(addToCurrentPlan).toHaveBeenCalledWith({
      recipeId: gryta.id,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      weekday: 4,
    });
    // The sheet closes, and the toast shows, once the answer has settled.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Lägg till rätt/ })).toBeNull());
    expect(toast()).toHaveTextContent("Lagt på matsedeln, torsdag.");
  });

  it("opens Lägg till rätt on the day of a tapped free day", async () => {
    const user = userEvent.setup();
    render(<Matsedel initial={[pasta]} recipes={[lasagne]} />);
    await user.click(within(dayRow(5)).getByTestId("day-free"));
    expect(within(screen.getByRole("dialog", { name: "Lägg till rätt på fredag" })).getByRole("radio", { name: "Fredag" })).toBeChecked();
  });

  it("adds without a day when Ingen dag is chosen", async () => {
    const user = userEvent.setup();
    addToCurrentPlan.mockResolvedValue(ok(rowOf(pasta)));
    render(<Matsedel initial={[]} recipes={[lasagne, gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: /^Lägg till rätt/ });
    await user.click(within(sheet).getByRole("radio", { name: "Ingen dag" }));
    expect(sheet).toHaveAccessibleName("Lägg till rätt");
    await user.click(within(sheet).getByRole("button", { name: /Krämig kycklinggryta/ }));
    expect(addToCurrentPlan).toHaveBeenCalledWith(expect.objectContaining({ weekday: null }));
    await waitFor(() => expect(toast()).toHaveTextContent("Lagt på matsedeln."));
  });

  it("searches the library under the favourites", async () => {
    const user = userEvent.setup();
    searchRecipes.mockResolvedValue(ok([lasagne]));
    render(<Matsedel initial={[]} recipes={[lasagne, gryta]} />);
    await user.click(screen.getAllByRole("button", { name: "Lägg till rätt" })[0]);
    const sheet = screen.getByRole("dialog", { name: /^Lägg till rätt/ });
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
    const sheet = screen.getByRole("dialog", { name: /^Lägg till rätt/ });
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
    await openMore("Pasta");
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
    await openMore("Pasta");
    await user.click(screen.getByRole("button", { name: "Fler portioner, Pasta" }));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ta bort från matsedeln" }), { detail: 1 }));
    await act(async () => write.resolve(fail("mealplan_servings_failed")));
    expect(toast()).toHaveTextContent("Tog bort Pasta.");
    expect(within(toast()).getByRole("button", { name: "Ångra" })).toBeInTheDocument();
  });

  it("puts every dish removed under one confirmation back with Ångra", async () => {
    render(<Matsedel initial={[pasta, soppa, gryta]} />);
    await removeFromSheet("Pasta");
    await removeFromSheet("Soppa");
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
  it("goes to the next dish, else the one before, else Lägg till rätt", async () => {
    render(<Matsedel initial={[pasta, soppa, gryta]} />);
    await removeFromSheet("Soppa", 0);
    expect(screen.getByRole("link", { name: "Gryta" })).toHaveFocus();
    await removeFromSheet("Gryta", 0);
    expect(screen.getByRole("link", { name: "Pasta" })).toHaveFocus();
    await removeFromSheet("Pasta", 0);
    expect(screen.getByText("Den här veckan är tom.")).toBeInTheDocument();
    const add = screen.getAllByRole("button", { name: "Lägg till rätt" }).find((button) => button.textContent === "Lägg till rätt");
    expect(add).toHaveFocus();
  });

  it("goes to ⋯ for a dish whose recipe is gone", async () => {
    render(<Matsedel initial={[pasta, gone]} />);
    await removeFromSheet("Pasta");
    expect(screen.getByRole("button", { name: "Fler val för Gammal gryta" })).toHaveFocus();
  });
});
