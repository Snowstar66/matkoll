import { act, render as renderElement, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
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

describe("RecipeView", () => {
  it("shows the title, time, servings and the source as a link", () => {
    render(<RecipeView recipe={recipe} />);
    expect(screen.getByRole("heading", { level: 1, name: "Krämig kycklinggryta" })).toBeInTheDocument();
    expect(screen.getByText("35 min · 4 portioner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "koket.se" })).toHaveAttribute("href", recipe.sourceUrl);
  });

  it("says portion for one and leaves out a time of 0", () => {
    render(<RecipeView recipe={{ ...recipe, servings: 1, totalMinutes: 0 }} />);
    expect(screen.getByText("1 portion")).toBeInTheDocument();
    expect(screen.queryByText(/^0 min/)).not.toBeInTheDocument();
  });

  it("shows amounts, and the original text where the name does not say it all", () => {
    render(<RecipeView recipe={recipe} />);
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

  it("numbers the steps", () => {
    render(<RecipeView recipe={recipe} />);
    const steps = within(screen.getByRole("region", { name: "Steg" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual(["1Skär kycklingen i bitar.", "2Låt puttra i 20 minuter."]);
  });

  it("has the heart beside the title; a tap shows it at once, and a failed save puts it back", async () => {
    const user = userEvent.setup();
    let answer: (result: Result<FavoriteChange>) => void = () => {};
    setFavorite.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    render(<RecipeView recipe={recipe} />);
    await user.click(screen.getByRole("button", { name: "Favorit", pressed: false }));
    expect(setFavorite).toHaveBeenCalledWith({ id: recipe.id, isFavorite: true });
    expect(screen.getByRole("button", { name: "Favorit", pressed: true })).toBeInTheDocument();
    await act(async () => answer(fail("recipe_favorite_failed")));
    expect(screen.getByRole("button", { name: "Favorit", pressed: false })).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att spara favoriten.");
  });
});
