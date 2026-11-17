import { render as renderElement, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import { fail, ok } from "@/lib/errors";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import type { LineActions } from "./recipe-body";
import { RecipeView } from "./recipe-view";

// Stryk ingrediens: tap a row, then "Ändra mängd" or "Stryk"; a struck row is grey and has "Ta tillbaka".

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

const kokos = "22222222-2222-4222-8222-222222222222";
const koriander = "33333333-3333-4333-8333-333333333333";
const line = (id: string, overrides: Partial<SavedRecipeLine>): SavedRecipeLine => ({
  id,
  position: 0,
  originalText: "",
  amount: null,
  unit: null,
  isVague: true,
  ingredientId: null,
  ingredientName: null,
  stepId: null,
  ...overrides,
});

const baseLines: SavedRecipeLine[] = [
  line("kokos", { originalText: "4 dl kokosmjölk", amount: 4, unit: "dl", isVague: false, ingredientId: kokos, ingredientName: "Kokosmjölk" }),
  line("koriander", { originalText: "1 knippe färsk koriander", amount: 1, unit: "st", isVague: false, ingredientId: koriander, ingredientName: "Koriander" }),
  line("salt", { originalText: "Salt och peppar efter smak" }),
];

const recipe: SavedRecipe = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Thaicurry",
  servings: 4,
  totalMinutes: 30,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  isFavorite: false,
  updatedAt: "2026-11-17T10:00:00.123456+00:00",
  steps: [
    { id: "s1", position: 0, text: "Fräs currypastan och tillsätt kokosmjölken." },
    { id: "s2", position: 1, text: "Hacka koriandern och strö över före servering." },
  ],
  lines: baseLines,
};
const struckRecipe: SavedRecipe = { ...recipe, lines: baseLines.map((l) => (l.id === "koriander" ? { ...l, isStruck: true } : l)) };

const actions = (): LineActions & { setStruck: ReturnType<typeof vi.fn>; setAmount: ReturnType<typeof vi.fn> } => ({
  setStruck: vi.fn().mockResolvedValue(ok({})),
  setAmount: vi.fn().mockResolvedValue(ok({})),
  replace: vi.fn().mockResolvedValue(ok({})),
  search: vi.fn().mockResolvedValue(ok([])),
});
const row = (id: string) => document.getElementById(`recipe-line-${id}`) as HTMLElement;
const nothingAtHome = toSnapshot([]);

describe("RecipeView: stryk ingrediens", () => {
  it("has the help row under Ingredienser, and rows that cannot be pressed without actions", () => {
    const { unmount } = render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={actions()} />);
    expect(screen.getByTestId("recipe-lines-help")).toHaveTextContent("Tryck på en rad för att ändra mängd, byta ut eller stryka.");
    unmount();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} />);
    expect(screen.queryByTestId("recipe-lines-help")).not.toBeInTheDocument();
    expect(within(row("kokos")).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a row with the chips Ändra mängd and Stryk on a tap, one row at a time, and closes it on a second tap", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={actions()} />);
    await user.click(within(row("kokos")).getByRole("button", { expanded: false }));
    expect(within(row("kokos")).getByRole("button", { name: "Ändra mängd" })).toBeInTheDocument();
    expect(within(row("kokos")).getByRole("button", { name: "Stryk" })).toBeInTheDocument();

    await user.click(within(row("koriander")).getByRole("button", { expanded: false }));
    expect(within(row("kokos")).queryByRole("button", { name: "Stryk" })).not.toBeInTheDocument();
    expect(within(row("koriander")).getByRole("button", { name: "Stryk" })).toBeInTheDocument();

    await user.click(within(row("koriander")).getByRole("button", { expanded: true }));
    expect(screen.queryByRole("button", { name: "Stryk" })).not.toBeInTheDocument();
  });

  it("gives a row without an amount only Stryk", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={actions()} />);
    await user.click(within(row("salt")).getByRole("button"));
    expect(within(row("salt")).getByRole("button", { name: "Stryk" })).toBeInTheDocument();
    expect(within(row("salt")).queryByRole("button", { name: "Ändra mängd" })).not.toBeInTheDocument();
  });

  it("strikes the line with the recipe's updatedAt when Stryk is pressed, and closes the row", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
    await user.click(within(row("koriander")).getByRole("button"));
    await user.click(within(row("koriander")).getByRole("button", { name: "Stryk" }));
    expect(lineActions.setStruck).toHaveBeenCalledWith({ recipeId: recipe.id, lineId: "koriander", isStruck: true, updatedAt: recipe.updatedAt });
    await vi.waitFor(() => expect(screen.queryByRole("button", { name: "Stryk" })).not.toBeInTheDocument());
  });

  it("shows a struck row struck through with Ta tillbaka, and counts it nowhere", () => {
    render(<RecipeView recipe={struckRecipe} snapshot={nothingAtHome} lineActions={actions()} />);
    const struck = row("koriander");
    expect(struck).toHaveAttribute("data-struck");
    expect(within(struck).getByText("Koriander").closest("span.line-through")).not.toBeNull();
    expect(within(struck).getByRole("img")).toHaveAccessibleName(/struken/);
    expect(within(struck).getByRole("button", { name: "Ta tillbaka" })).toBeInTheDocument();
    expect(within(struck).queryByText("Saknas")).not.toBeInTheDocument();
    // 1 of 2 compared lines, not 2: the struck line is not in "X av Y hemma".
    expect(screen.getByTestId("recipe-at-home")).toHaveTextContent("0 av 1 hemma");
  });

  it("restores the line with Ta tillbaka", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    render(<RecipeView recipe={struckRecipe} snapshot={nothingAtHome} lineActions={lineActions} />);
    await user.click(within(row("koriander")).getByRole("button", { name: "Ta tillbaka" }));
    expect(lineActions.setStruck).toHaveBeenCalledWith({ recipeId: recipe.id, lineId: "koriander", isStruck: false, updatedAt: recipe.updatedAt });
  });

  it("says how many are struck under the time, and nothing when none is", () => {
    const { unmount } = render(<RecipeView recipe={recipe} snapshot={nothingAtHome} />);
    expect(screen.getByTestId("recipe-meta")).toHaveTextContent("30 min");
    expect(screen.queryByTestId("recipe-struck-count")).not.toBeInTheDocument();
    unmount();
    render(<RecipeView recipe={struckRecipe} snapshot={nothingAtHome} />);
    expect(screen.getByTestId("recipe-meta")).toHaveTextContent("30 min · 1 ingrediens struken");
  });

  it("puts a warning under the step that names a struck ingredient, and under no other; the step text is unchanged", () => {
    render(<RecipeView recipe={struckRecipe} snapshot={nothingAtHome} />);
    const steps = screen.getAllByTestId("recipe-step");
    expect(within(steps[0]).queryByTestId("recipe-step-struck")).not.toBeInTheDocument();
    expect(within(steps[1]).getByTestId("recipe-step-struck")).toHaveTextContent("Nämner koriander, som du har strukit.");
    expect(steps[1]).toHaveTextContent("Hacka koriandern och strö över före servering.");
  });

  it("has no warning when nothing is struck", () => {
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} />);
    expect(screen.queryByTestId("recipe-step-struck")).not.toBeInTheDocument();
  });

  it("does not offer a struck ingredient in Köp det som saknas", async () => {
    render(<RecipeView recipe={struckRecipe} snapshot={nothingAtHome} buyMissing={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Köp det som saknas (1)" })).toBeInTheDocument();
  });

  describe("Ändra mängd", () => {
    it("turns the amount into a number field with Spara and Avbryt, and Avbryt goes back to the chips", async () => {
      const user = userEvent.setup();
      const lineActions = actions();
      render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
      await user.click(within(row("kokos")).getByRole("button"));
      await user.click(within(row("kokos")).getByRole("button", { name: "Ändra mängd" }));
      expect(within(row("kokos")).getByRole("textbox", { name: "Mängd" })).toHaveValue("4");
      await user.click(within(row("kokos")).getByRole("button", { name: "Avbryt" }));
      expect(within(row("kokos")).getByRole("button", { name: "Stryk" })).toBeInTheDocument();
      expect(lineActions.setAmount).not.toHaveBeenCalled();
    });

    it("saves the typed amount, comma allowed", async () => {
      const user = userEvent.setup();
      const lineActions = actions();
      render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
      await user.click(within(row("kokos")).getByRole("button"));
      await user.click(within(row("kokos")).getByRole("button", { name: "Ändra mängd" }));
      const field = within(row("kokos")).getByRole("textbox", { name: "Mängd" });
      await user.clear(field);
      await user.type(field, "2,5");
      await user.click(within(row("kokos")).getByRole("button", { name: "Spara" }));
      expect(lineActions.setAmount).toHaveBeenCalledWith({ recipeId: recipe.id, lineId: "kokos", amount: 2.5, updatedAt: recipe.updatedAt });
    });

    it("turns the amount typed for 8 portions back into the recipe's own 4", async () => {
      const user = userEvent.setup();
      const lineActions = actions();
      render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
      for (let i = 0; i < 4; i++) await user.click(screen.getByRole("button", { name: "Fler portioner" }));
      await user.click(within(row("kokos")).getByRole("button"));
      await user.click(within(row("kokos")).getByRole("button", { name: "Ändra mängd" }));
      const field = within(row("kokos")).getByRole("textbox", { name: "Mängd" });
      expect(field).toHaveValue("8");
      await user.clear(field);
      await user.type(field, "6");
      await user.click(within(row("kokos")).getByRole("button", { name: "Spara" }));
      expect(lineActions.setAmount).toHaveBeenCalledWith(expect.objectContaining({ lineId: "kokos", amount: 3 }));
    });

    it("saves nothing for an amount that is not a number above zero, and says so", async () => {
      const user = userEvent.setup();
      const lineActions = actions();
      render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
      await user.click(within(row("kokos")).getByRole("button"));
      await user.click(within(row("kokos")).getByRole("button", { name: "Ändra mängd" }));
      const field = within(row("kokos")).getByRole("textbox", { name: "Mängd" });
      await user.clear(field);
      await user.type(field, "0");
      await user.click(within(row("kokos")).getByRole("button", { name: "Spara" }));
      expect(lineActions.setAmount).not.toHaveBeenCalled();
      expect(await screen.findByRole("alert")).toHaveTextContent("Skriv en mängd större än noll.");
    });
  });

  it("keeps the row open and shows the error when saving fails; a conflict refreshes the page", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    lineActions.setStruck.mockResolvedValueOnce(fail("recipe_line_failed")).mockResolvedValueOnce(fail("recipe_conflict"));
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
    await user.click(within(row("koriander")).getByRole("button"));
    await user.click(within(row("koriander")).getByRole("button", { name: "Stryk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att ändra raden.");
    expect(within(row("koriander")).getByRole("button", { name: "Stryk" })).toBeInTheDocument();
    await user.click(within(row("koriander")).getByRole("button", { name: "Stryk" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
