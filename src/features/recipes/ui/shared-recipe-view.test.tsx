import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { toSnapshot } from "@/features/pantry";
import { fail, ok, type Result } from "@/lib/errors";
import { parseSharedRecipe, toSharedView } from "../domain/shared-recipe";
import type { AddToPlan, BuyMissing, UndoBuy } from "./recipe-body";
import { SharedRecipeView } from "./shared-recipe-view";

// Another household's shared recipe opened: usable as it is, "Delat av …", no heart and no
// menu, Spara with its toast, and the quiet copy before Lägg på matsedeln and Köp det som saknas.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
const saveSharedRecipe = vi.fn<(id: string) => Promise<Result<{ id: string; ingredientIds: (string | null)[] }>>>();
vi.mock("../actions/save-shared-recipe", () => ({ saveSharedRecipe: (id: string) => saveSharedRecipe(id) }));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

const sharedId = "11111111-1111-4111-8111-111111111111";
const copyId = "99999999-9999-4999-8999-999999999999";
const chicken = "22222222-2222-4222-8222-222222222222";
const copyChicken = chicken;
const copyLettuce = "33333333-3333-4333-8333-333333333333";

const shared = parseSharedRecipe({
  id: sharedId,
  title: "Caesarkyckling",
  servings: 4,
  total_minutes: 45,
  image_url: null,
  source_kind: "url",
  source_url: "https://www.tasteline.com/recept/caesar",
  household_name: "Lindqvists",
  saved_copy_id: null,
  steps: [{ title: null, text: "Stek kycklingen i 10 minuter." }],
  lines: [
    { original_text: "600 g kycklingfilé", amount: 600, unit: "g", is_vague: false, section: null, step_index: 0, ingredient_name: "Kycklingfilé", ingredient_section: "Kött och fisk" },
    { original_text: "1 romansallad", amount: 1, unit: "st", is_vague: false, section: null, step_index: null, ingredient_name: "Romansallad", ingredient_section: "Frukt och grönt" },
  ],
})!;
// The household has chicken (at home), and no lettuce in its catalog at all.
const recipe = toSharedView(shared, [
  { kind: "match", ingredientId: chicken, confidence: "exact" },
  { kind: "new", proposal: { name: "Romansallad", section: "Frukt och grönt", location: "Kyl", defaultUnit: null } },
]);
const snapshot = toSnapshot([{ ingredientId: chicken, amount: 1000, unit: "g" }]);

const addToPlan = vi.fn<AddToPlan>();
const buyMissing = vi.fn<BuyMissing>();
const undoBuy = vi.fn<UndoBuy>();
const removeFromPlan = vi.fn(async () => ok({}));

function renderView(savedCopyId: string | null = null) {
  return render(
    <ToastProvider>
      <SharedRecipeView
        recipe={recipe}
        householdName="Lindqvists"
        savedCopyId={savedCopyId}
        snapshot={snapshot}
        addToPlan={addToPlan}
        buyMissing={buyMissing}
        undoBuy={undoBuy}
        removeFromPlan={removeFromPlan}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  refresh.mockReset();
  saveSharedRecipe.mockReset().mockResolvedValue(ok({ id: copyId, ingredientIds: [copyChicken, copyLettuce] }));
  addToPlan.mockReset().mockResolvedValue(ok({ weekday: null }));
  buyMissing.mockReset().mockResolvedValue(ok({}));
  undoBuy.mockReset().mockResolvedValue(ok({}));
  window.localStorage.clear();
});

describe("SharedRecipeView", () => {
  it("shows whose it is, no heart and no menu, and what is at home against the household's own pantry", () => {
    renderView();
    expect(screen.getByRole("heading", { level: 1, name: "Caesarkyckling" })).toBeInTheDocument();
    expect(screen.getByTestId("recipe-shared-by")).toHaveTextContent("Delat av Lindqvists");
    expect(screen.queryByRole("button", { name: /^Favorit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Fler val" })).toBeNull();
    // The lettuce the household has never had counts as missing.
    expect(screen.getByTestId("recipe-at-home")).toHaveTextContent("1 av 2 hemma");
    expect(screen.getByTestId("buy-missing-text")).toHaveTextContent("Köp det som saknas (1)");
    expect(screen.getByRole("button", { name: "Spara i mina recept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Lägg på matsedeln" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Starta timer/ })).toBeInTheDocument();
  });

  it("saves a copy with Spara, says so with Öppna, and is Sparat after", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Spara i mina recept" }));
    expect(saveSharedRecipe).toHaveBeenCalledWith(sharedId);
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Sparat i dina recept");
    await user.click(within(toast).getByRole("button", { name: "Öppna" }));
    expect(push).toHaveBeenCalledWith(`/recept/${copyId}`);
    expect(screen.getByTestId("save-shared")).toBeDisabled();
    expect(screen.getByTestId("save-shared")).toHaveTextContent("Sparat");
  });

  it("is Sparat at once when the household has saved it before", () => {
    renderView(copyId);
    expect(screen.getByTestId("save-shared")).toBeDisabled();
    expect(screen.getByTestId("save-shared")).toHaveTextContent("Sparat");
  });

  it("puts the copy on the meal plan, saved quietly first", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(saveSharedRecipe).toHaveBeenCalledTimes(1);
    expect(addToPlan).toHaveBeenCalledWith(expect.objectContaining({ recipeId: copyId, weekday: null }));
    expect(screen.getByTestId("save-shared")).toBeDisabled();
  });

  it("buys what is missing as the copy's ingredients, keyed by the copy, and undoes the same keys", async () => {
    const user = userEvent.setup();
    renderView();
    await user.click(screen.getByTestId("buy-missing-text"));
    const sheet = await screen.findByRole("dialog");
    await act(async () => {
      await user.click(within(sheet).getByRole("button", { name: /^Lägg .*på listan$/ }));
    });
    expect(buyMissing).toHaveBeenCalledWith({
      items: [{ key: `recipe:${copyId}:${copyLettuce}`, label: "Romansallad", ingredientId: copyLettuce }],
    });
    await user.click(await screen.findByTestId("buy-missing-text"));
    expect(undoBuy).toHaveBeenCalledWith({ keys: [`recipe:${copyId}:${copyLettuce}`] });
  });

  it("says so when the recipe is no longer shared, and changes nothing", async () => {
    const user = userEvent.setup();
    saveSharedRecipe.mockResolvedValue(fail("recipe_shared_gone"));
    renderView();
    await user.click(screen.getByRole("button", { name: "Lägg på matsedeln" }));
    expect(addToPlan).not.toHaveBeenCalled();
    expect(await screen.findByTestId("toast")).toHaveTextContent("Receptet delas inte längre.");
    expect(screen.getByTestId("save-shared")).toBeEnabled();
  });
});
