import { act, render as renderElement, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { recipeStatus, toSnapshot } from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import type { FavoriteChange } from "../domain/recipe-list";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import { RecipeView } from "./recipe-view";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setFavorite = vi.fn<(change: FavoriteChange) => Promise<Result<FavoriteChange>>>();
vi.mock("../actions/set-favorite", () => ({ setFavorite: (change: FavoriteChange) => setFavorite(change) }));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

let lineId = 0;
const line = (overrides: Partial<SavedRecipeLine> & Pick<SavedRecipeLine, "originalText">): SavedRecipeLine => ({
  id: `line-${lineId}`,
  position: lineId++,
  amount: null,
  unit: null,
  isVague: true,
  ingredientId: null,
  ingredientName: null,
  stepId: null,
  ...overrides,
});

const recipe: SavedRecipe = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Krämig kycklinggryta",
  servings: 4,
  totalMinutes: 35,
  imageUrl: null,
  sourceKind: "url",
  sourceUrl: "https://www.koket.se/kramig-kycklinggryta",
  isFavorite: false,
  updatedAt: "2026-10-26T10:00:00.123456+00:00",
  steps: [
    { id: "step-0", position: 0, text: "Skär kycklingen i bitar." },
    { id: "step-1", position: 1, text: "Låt puttra i 20 minuter." },
  ],
  lines: [
    line({
      originalText: "600 g kycklinglårfilé",
      amount: 600,
      unit: "g",
      isVague: false,
      ingredientId: "22222222-2222-4222-8222-222222222222",
      ingredientName: "Kycklinglårfilé",
    }),
    // Pontus swapped the ingredient: the original text says more than the name.
    line({
      originalText: "1 lök, finhackad",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredientId: "33333333-3333-4333-8333-333333333333",
      ingredientName: "Rödlök",
    }),
    // An amount but no catalog ingredient.
    line({ originalText: "2 nävar spenat", amount: 2, isVague: false }),
    line({
      originalText: "salt och peppar",
      ingredientId: "44444444-4444-4444-8444-444444444444",
      ingredientName: "Salt",
    }),
  ],
};

const rows = () => screen.getAllByTestId("recipe-view-line");

const [kyckling, rodlok, , salt] = recipe.lines.map((line) => line.ingredientId ?? "");
/** Everything at home, for the tests that are not about the status. */
const allHome = recipeStatus(
  recipe,
  recipe.servings,
  toSnapshot([
    { ingredientId: kyckling, amount: 600, unit: "g" },
    { ingredientId: rodlok, amount: 2, unit: "st" },
    { ingredientId: salt, amount: null, unit: null },
  ]),
);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecipeView", () => {
  it("shows the title, time, servings and the source as a link", () => {
    render(<RecipeView recipe={recipe} status={allHome} />);
    expect(screen.getByRole("heading", { level: 1, name: "Krämig kycklinggryta" })).toBeInTheDocument();
    expect(screen.getByText("35 min · 4 portioner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "koket.se" })).toHaveAttribute("href", recipe.sourceUrl);
  });

  it("says portion for one and leaves out a time of 0", () => {
    render(<RecipeView recipe={{ ...recipe, servings: 1, totalMinutes: 0 }} status={allHome} />);
    expect(screen.getByText("1 portion")).toBeInTheDocument();
    expect(screen.queryByText(/^0 min/)).not.toBeInTheDocument();
  });

  it("shows amounts, and the original text where the name does not say it all", () => {
    render(<RecipeView recipe={recipe} status={allHome} />);
    expect(rows()).toHaveLength(4);
    expect(rows()[0]).toHaveTextContent(/^Kycklinglårfilé600 g$/);
    expect(within(rows()[1]).getByText("Rödlök")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 lök, finhackad")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 st")).toBeInTheDocument();
    // No ingredient: the original text, without a separate amount.
    expect(rows()[2]).toHaveTextContent(/^2 nävar spenat$/);
    // Vague: the original text.
    expect(rows()[3]).toHaveTextContent(/^salt och peppar$/);
  });

  it("says Kan lagas nu and ticks every line when everything is at home; a line without ingredient is neutral", () => {
    render(<RecipeView recipe={recipe} status={allHome} />);
    expect(screen.getByText("Kan lagas nu")).toHaveClass("bg-mint", "text-mint-ink");
    const marks = rows().map((row) => within(row).getByRole("img").getAttribute("aria-label"));
    expect(marks).toEqual(["finns hemma", "finns hemma", "jämförs inte med lagret", "finns hemma"]);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-ink-2");
  });

  it("says Saknar N varor, rings what is short, and shows what is at home in another unit", () => {
    // Chicken only in kg, no onion, and no salt: the vague salt is ringed but not counted.
    const status = recipeStatus(recipe, recipe.servings, toSnapshot([{ ingredientId: kyckling, amount: 1, unit: "kg" }]));
    render(<RecipeView recipe={recipe} status={status} />);
    expect(screen.getByText("Saknar 2 varor")).toHaveClass("bg-sky", "text-sky-ink");
    const marks = rows().map((row) => within(row).getByRole("img").getAttribute("aria-label"));
    expect(marks).toEqual(["saknas", "saknas", "jämförs inte med lagret", "saknas"]);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 1 kg")).toBeInTheDocument();
    expect(within(rows()[1]).getByText("1 st")).toHaveClass("text-sky-ink");
    expect(within(rows()[1]).queryByText(/^hemma:/)).not.toBeInTheDocument();
  });

  it("says Saknar 1 vara for one ingredient", () => {
    const status = recipeStatus(
      recipe,
      recipe.servings,
      toSnapshot([
        { ingredientId: kyckling, amount: 600, unit: "g" },
        { ingredientId: salt, amount: null, unit: null },
      ]),
    );
    render(<RecipeView recipe={recipe} status={status} />);
    expect(screen.getByText("Saknar 1 vara")).toHaveClass("bg-sky");
  });

  it("shows everything at home beside a line with too little: every unit of the ingredient", () => {
    const cream = line({
      originalText: "3 dl matlagningsgrädde",
      amount: 3,
      unit: "dl",
      isVague: false,
      ingredientId: "55555555-5555-4555-8555-555555555555",
      ingredientName: "Matlagningsgrädde",
    });
    const withCream = { ...recipe, lines: [cream] };
    const status = recipeStatus(
      withCream,
      4,
      toSnapshot([
        { ingredientId: cream.ingredientId!, amount: 2, unit: "dl" },
        { ingredientId: cream.ingredientId!, amount: 1, unit: "l" },
      ]),
    );
    render(<RecipeView recipe={withCream} status={status} />);
    expect(within(rows()[0]).getByRole("img")).toHaveAccessibleName("saknas");
    expect(within(rows()[0]).getByText("3 dl")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 2 dl, 1 l")).toBeInTheDocument();
  });

  it("shows the amount, its colour and what is at home for a line whose ingredient has no name", () => {
    const nameless = line({
      originalText: "2 dl vetemjöl",
      amount: 2,
      unit: "dl",
      isVague: false,
      ingredientId: "66666666-6666-4666-8666-666666666666",
      ingredientName: null,
    });
    const withNameless = { ...recipe, lines: [nameless] };
    const status = recipeStatus(withNameless, 4, toSnapshot([{ ingredientId: nameless.ingredientId!, amount: 1, unit: "kg" }]));
    render(<RecipeView recipe={withNameless} status={status} />);
    expect(within(rows()[0]).getByText("2 dl vetemjöl")).toBeInTheDocument();
    expect(within(rows()[0]).getByText("2 dl")).toHaveClass("text-sky-ink");
    expect(within(rows()[0]).getByText("hemma: 1 kg")).toBeInTheDocument();
  });

  it("shows the recipe without badge or marks when the pantry could not be read", () => {
    render(<RecipeView recipe={recipe} status={null} />);
    expect(screen.queryByText(/^Kan lagas nu$|^Saknar/)).not.toBeInTheDocument();
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(rows()).toHaveLength(4);
    expect(within(rows()[0]).getByText("600 g")).toHaveClass("text-ink-2");
  });

  it("logs a line the status has no coverage for, and shows it neutrally", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rest = Object.fromEntries(Object.entries(allHome.lines).filter(([id]) => id !== recipe.lines[0].id));
    render(<RecipeView recipe={recipe} status={{ ...allHome, lines: rest }} />);
    expect(within(rows()[0]).getByRole("img")).toHaveAccessibleName("jämförs inte med lagret");
    expect(log).toHaveBeenCalledWith("recipe_line_status_missing", { lineId: recipe.lines[0].id });
  });

  it("numbers the steps", () => {
    render(<RecipeView recipe={recipe} status={allHome} />);
    const steps = within(screen.getByRole("region", { name: "Steg" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["1Skär kycklingen i bitar.", "2Låt puttra i 20 minuter."]);
  });

  it("has the heart beside the title; a tap shows it at once, and a failed save puts it back", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<FavoriteChange>) => void = () => {};
    setFavorite.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<RecipeView recipe={recipe} status={allHome} />);
    await user.click(screen.getByRole("button", { name: "Favorit", pressed: false }));
    expect(setFavorite).toHaveBeenCalledWith({ id: recipe.id, isFavorite: true });
    expect(screen.getByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
    await act(async () => answer(fail("recipe_favorite_failed")));
    expect(screen.getByRole("button", { name: "Favorit", pressed: false })).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att spara favoriten.");
  });
});
