import { render as renderElement, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import { ok } from "@/lib/errors";
import type { SavedRecipe, SavedRecipeLine } from "../domain/saved-recipe";
import type { LineActions } from "./recipe-body";
import { RecipeView } from "./recipe-view";

// Byt ut ingrediens: tap a row, "Byt ut", type a name or tap a suggestion; the amount stays; "Ta tillbaka" puts it back.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

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

const korianderLine = line("koriander", { originalText: "1 knippe färsk koriander", amount: 1, unit: "st", isVague: false, ingredientId: "33333333-3333-4333-8333-333333333333", ingredientName: "Koriander" });
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
  steps: [{ id: "s1", position: 0, text: "Hacka koriandern och strö över före servering." }],
  lines: [korianderLine],
};
const replaced: SavedRecipe = {
  ...recipe,
  lines: [{ ...korianderLine, originalText: "Persilja", ingredientName: "Persilja", replacedFrom: "1 knippe färsk koriander" }],
};

const actions = () => ({
  setStruck: vi.fn().mockResolvedValue(ok({})),
  setAmount: vi.fn().mockResolvedValue(ok({})),
  replace: vi.fn().mockResolvedValue(ok({})),
  search: vi.fn().mockResolvedValue(ok([{ id: "p", name: "Persilja" }, { id: "d", name: "Dill" }])),
}) satisfies LineActions;
const row = (id: string) => document.getElementById(`recipe-line-${id}`) as HTMLElement;
const nothingAtHome = toSnapshot([]);

describe("RecipeView: byt ut ingrediens", () => {
  it("has a Byt ut chip between Ändra mängd and Stryk", async () => {
    const user = userEvent.setup();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={actions()} />);
    await user.click(within(row("koriander")).getByRole("button", { expanded: false }));
    expect(within(row("koriander")).getAllByRole("button").map((button) => button.textContent).slice(1)).toEqual(["Ändra mängd", "Byt ut", "Stryk"]);
  });

  it("replaces with a tapped suggestion, with the recipe's updatedAt", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
    await user.click(within(row("koriander")).getByRole("button", { expanded: false }));
    await user.click(within(row("koriander")).getByRole("button", { name: "Byt ut" }));
    expect(within(row("koriander")).getByText("Mängden (1 st) följer med.")).toBeInTheDocument();
    await user.type(within(row("koriander")).getByRole("textbox", { name: "Byt till" }), "pers");
    await user.click(await within(row("koriander")).findByRole("button", { name: "Persilja" }));
    expect(lineActions.replace).toHaveBeenCalledWith({ recipeId: recipe.id, lineId: "koriander", name: "Persilja", updatedAt: recipe.updatedAt });
  });

  it("replaces with a typed name that is not a suggestion", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    render(<RecipeView recipe={recipe} snapshot={nothingAtHome} lineActions={lineActions} />);
    await user.click(within(row("koriander")).getByRole("button", { expanded: false }));
    await user.click(within(row("koriander")).getByRole("button", { name: "Byt ut" }));
    await user.type(within(row("koriander")).getByRole("textbox", { name: "Byt till" }), "bladpersilja");
    await user.click(within(row("koriander")).getByRole("button", { name: "Byt" }));
    await waitFor(() => expect(lineActions.replace).toHaveBeenCalledWith(expect.objectContaining({ name: "bladpersilja" })));
  });

  it("shows what a replaced line was, offers Ta tillbaka, and warns under a step that still names it", async () => {
    const user = userEvent.setup();
    const lineActions = actions();
    render(<RecipeView recipe={replaced} snapshot={nothingAtHome} lineActions={lineActions} />);
    expect(within(row("koriander")).getByTestId("recipe-line-replaced")).toHaveTextContent("i stället för färsk koriander");
    expect(screen.getByTestId("recipe-step-replaced")).toHaveTextContent("Nämner koriander, som du har bytt ut.");
    await user.click(within(row("koriander")).getByRole("button", { expanded: false }));
    await user.click(within(row("koriander")).getByRole("button", { name: "Ta tillbaka" }));
    expect(lineActions.replace).toHaveBeenCalledWith({ recipeId: recipe.id, lineId: "koriander", name: null, updatedAt: recipe.updatedAt });
  });
});
