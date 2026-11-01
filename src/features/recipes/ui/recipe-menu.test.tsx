import { act, fireEvent, render as renderElement, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { RecipeDraft } from "../domain/recipe-draft";
import type { SavedRecipe } from "../domain/saved-recipe";
import { unshownErrorMessage } from "./edit-recipe-sheet";
import { RecipeMenu } from "./recipe-menu";

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));
const updateRecipe = vi.fn<(id: string, draft: RecipeDraft, updatedAt: string) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/update-recipe", () => ({
  updateRecipe: (id: string, draft: RecipeDraft, updatedAt: string) => updateRecipe(id, draft, updatedAt),
}));
const deleteRecipe = vi.fn<(id: string) => Promise<Result<{ id: string }>>>();
vi.mock("../actions/delete-recipe", () => ({ deleteRecipe: (id: string) => deleteRecipe(id) }));

const render = (element: ReactElement) => renderElement(<ToastProvider>{element}</ToastProvider>);

const recipe: SavedRecipe = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Linssoppa",
  servings: 4,
  totalMinutes: 30,
  imageUrl: null,
  sourceKind: "text",
  sourceUrl: null,
  isFavorite: false,
  updatedAt: "2026-10-26T10:00:00.123456+00:00",
  steps: [
    { id: "22222222-2222-4222-8222-222222222220", position: 0, text: "Hacka löken." },
    { id: "22222222-2222-4222-8222-222222222221", position: 1, text: "Koka allt." },
  ],
  lines: [
    {
      id: "33333333-3333-4333-8333-333333333330",
      position: 0,
      originalText: "1 gul lök",
      amount: 1,
      unit: "st",
      isVague: false,
      ingredientId: "44444444-4444-4444-8444-444444444440",
      ingredientName: "Gul lök",
      stepId: "22222222-2222-4222-8222-222222222220",
    },
    {
      id: "33333333-3333-4333-8333-333333333331",
      position: 1,
      originalText: "salt",
      amount: null,
      unit: null,
      isVague: true,
      ingredientId: "44444444-4444-4444-8444-444444444441",
      ingredientName: "Salt",
      stepId: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333332",
      position: 2,
      originalText: "2 morötter",
      amount: 2,
      unit: "st",
      isVague: false,
      ingredientId: "44444444-4444-4444-8444-444444444442",
      ingredientName: "Morot",
      stepId: null,
    },
  ],
};

const searchIngredients = vi.fn(async () => ok([]));

function openEdit(saved: SavedRecipe = recipe) {
  render(<RecipeMenu recipe={saved} searchIngredients={searchIngredients} />);
  fireEvent.click(screen.getByRole("button", { name: "Fler val" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Ändra" }));
  return screen.getByRole("dialog", { name: "Linssoppa" });
}

/** The form's row for the line with this original text. */
const lineRow = (sheet: HTMLElement, text: string) =>
  within(sheet).getAllByTestId("recipe-line").find((row) => within(row).queryByText(text, { exact: true }))!;

beforeEach(() => {
  replace.mockReset();
  refresh.mockReset();
  updateRecipe.mockReset().mockResolvedValue(ok({ id: recipe.id }));
  deleteRecipe.mockReset().mockResolvedValue(ok({ id: recipe.id }));
});

describe("RecipeMenu", () => {
  it("has Ändra and, last, Ta bort, which asks first (Story 19.6)", async () => {
    render(<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />);
    fireEvent.click(screen.getByRole("button", { name: "Fler val" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual(["Ändra", "Ta bort"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Ta bort" }));
    const question = await screen.findByRole("dialog", { name: "Ta bort Linssoppa?" });
    expect(question).toHaveTextContent("Det går inte att ångra.");
    expect(within(question).getByRole("button", { name: "Avbryt" })).toBeInTheDocument();
  });

  it("opens the menu with Ändra, and closes it with Esc", () => {
    render(<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />);
    const toggle = screen.getByRole("button", { name: "Fler val" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Ändra" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it("opens Ändra recept with the saved recipe filled in", () => {
    const sheet = openEdit();
    expect(within(sheet).getByLabelText("Titel")).toHaveValue("Linssoppa");
    expect(within(sheet).getByLabelText("Tid i minuter")).toHaveValue("30");
    expect(within(sheet).getByLabelText("Steg 1")).toHaveValue("Hacka löken.");
    expect(within(sheet).getByLabelText("Steg 2")).toHaveValue("Koka allt.");
    expect(within(sheet).getByRole("button", { name: "Gul lök, byt ingrediens" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Spara ändringar" })).toBeEnabled();
    expect(within(sheet).getByRole("button", { name: "Ta bort recept" })).toBeInTheDocument();
  });

  it("saves the changes with the saved ids, closes and confirms", async () => {
    const sheet = openEdit();
    fireEvent.change(within(sheet).getByLabelText("Titel"), { target: { value: "Röd linssoppa" } });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ta bort\s*steg 2$/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Lägg till steg" }));
    fireEvent.change(within(sheet).getByLabelText("Steg 2"), { target: { value: "Servera." } });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Spara ändringar" })));

    expect(updateRecipe).toHaveBeenCalledTimes(1);
    const [id, draft, updatedAt] = updateRecipe.mock.calls[0];
    expect(id).toBe(recipe.id);
    expect(updatedAt).toBe(recipe.updatedAt);
    expect(draft.title).toBe("Röd linssoppa");
    expect(draft.steps).toEqual([{ id: recipe.steps[0].id, text: "Hacka löken." }, "Servera."]);
    expect(draft.lines[0]).toMatchObject({ id: recipe.lines[0].id, stepIndexes: [0] });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Ändringarna är sparade.");
  });

  it("cannot save an empty title or step", () => {
    const sheet = openEdit();
    fireEvent.change(within(sheet).getByLabelText("Steg 1"), { target: { value: " " } });
    expect(within(sheet).getByText("Skriv vad steget gör.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Spara ändringar" })).toBeDisabled();
  });

  it("keeps the form and says so when saving fails", async () => {
    updateRecipe.mockResolvedValue(fail("recipe_save_failed"));
    const sheet = openEdit();
    fireEvent.change(within(sheet).getByLabelText("Titel"), { target: { value: "Röd linssoppa" } });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Spara ändringar" })));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det gick inte att spara receptet. Försök igen.");
    expect(within(sheet).getByLabelText("Titel")).toHaveValue("Röd linssoppa");
  });

  it("asks before closing with changes", () => {
    const sheet = openEdit();
    fireEvent.change(within(sheet).getByLabelText("Titel"), { target: { value: "Röd linssoppa" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Avbryt" }));
    expect(within(sheet).getByText("Släng ändringarna?")).toBeInTheDocument();
    expect(updateRecipe).not.toHaveBeenCalled();
  });

  it("asks before removing; Tillbaka keeps the recipe and the changes", () => {
    const sheet = openEdit();
    fireEvent.change(within(sheet).getByLabelText("Titel"), { target: { value: "Röd linssoppa" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort recept" }));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Det går inte att ångra.");
    fireEvent.click(within(sheet).getByRole("button", { name: "Tillbaka" }));
    expect(deleteRecipe).not.toHaveBeenCalled();
    expect(within(sheet).getByLabelText("Titel")).toHaveValue("Röd linssoppa");
  });

  it("removes the recipe after the question and goes to the library", async () => {
    const sheet = openEdit();
    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort recept" }));
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort" })));
    expect(deleteRecipe).toHaveBeenCalledWith(recipe.id);
    expect(replace).toHaveBeenCalledWith("/recept");
    expect(screen.getByRole("status")).toHaveTextContent("Tog bort Linssoppa.");
  });

  it("stays and says so when removing fails", async () => {
    deleteRecipe.mockResolvedValue(fail("recipe_delete_failed"));
    const sheet = openEdit();
    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort recept" }));
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort" })));
    expect(within(sheet).getAllByRole("alert").at(-1)).toHaveTextContent("Det gick inte att ta bort receptet. Försök igen.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("closes the menu on a pointer-down outside it", () => {
    render(<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />);
    fireEvent.click(screen.getByRole("button", { name: "Fler val" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on Tab without pulling focus back to ⋯", () => {
    render(<RecipeMenu recipe={recipe} searchIngredients={searchIngredients} />);
    const toggle = screen.getByRole("button", { name: "Fler val" });
    fireEvent.click(toggle);
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Ändra" }), { key: "Tab" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(toggle).not.toHaveFocus();
  });

  it("removes a line with Ta bort raden; the other lines keep their ids and their typed text", async () => {
    const sheet = openEdit();
    const carrots = lineRow(sheet, "2 morötter");
    // A typed amount that is not a number on a later line.
    fireEvent.click(within(carrots).getByRole("button", { name: /^Ändra\s*mängd för Morot$/ }));
    fireEvent.change(within(carrots).getByLabelText("Mängd"), { target: { value: "abc" } });
    expect(within(carrots).getByText("Ange ett tal.")).toBeInTheDocument();

    const salt = lineRow(sheet, "salt");
    fireEvent.click(within(salt).getByRole("button", { name: /^Ändra\s*mängd för Salt$/ }));
    fireEvent.click(within(salt).getByRole("button", { name: /^Ta bort raden\s*Salt$/ }));

    expect(within(sheet).getAllByTestId("recipe-line")).toHaveLength(2);
    expect(within(sheet).getByRole("button", { name: "Morot, byt ingrediens" })).toHaveFocus();
    // The error and the typed text stay with the carrots.
    // (Opening the salt's editor closed the carrots'; the typed text waits in the form.)
    const carrotsAfter = lineRow(sheet, "2 morötter");
    expect(within(carrotsAfter).getByText("Ange ett tal.")).toBeInTheDocument();
    fireEvent.click(within(carrotsAfter).getByRole("button", { name: /^Ändra\s*mängd för Morot$/ }));
    expect(within(carrotsAfter).getByLabelText("Mängd")).toHaveValue("abc");
    expect(within(lineRow(sheet, "1 gul lök")).queryByText("Ange ett tal.")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Spara ändringar" })).toBeDisabled();

    fireEvent.change(within(carrotsAfter).getByLabelText("Mängd"), { target: { value: "3" } });
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Spara ändringar" })));
    const [, draft] = updateRecipe.mock.calls[0];
    expect(draft.lines.map(({ id }) => id)).toEqual([recipe.lines[0].id, recipe.lines[2].id]);
    expect(draft.lines[1]).toMatchObject({ amount: 3, unit: "st" });
  });

  it("moves focus to the next line, or the heading when no line is left", () => {
    const sheet = openEdit();
    const remove = (name: string) => {
      const row = lineRow(sheet, name);
      fireEvent.click(within(row).getByRole("button", { name: /^Ändra\s*mängd/ }));
      fireEvent.click(within(row).getByRole("button", { name: /^Ta bort raden/ }));
    };
    remove("1 gul lök");
    expect(within(sheet).getByRole("button", { name: "Salt, byt ingrediens" })).toHaveFocus();
    // The last line: focus goes to the line before.
    remove("2 morötter");
    expect(within(sheet).getByRole("button", { name: "Salt, byt ingrediens" })).toHaveFocus();
    remove("salt");
    expect(within(sheet).getByRole("heading", { name: "Ingredienser" })).toHaveFocus();
  });

  it("moves focus to the next step, or Lägg till steg when no step is left", () => {
    const sheet = openEdit();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ta bort\s*steg 1$/ }));
    expect(within(sheet).getByLabelText("Steg 1")).toHaveFocus();
    expect(within(sheet).getByLabelText("Steg 1")).toHaveValue("Koka allt.");
    fireEvent.click(within(sheet).getByRole("button", { name: /^Ta bort\s*steg 1$/ }));
    expect(within(sheet).getByRole("button", { name: "Lägg till steg" })).toHaveFocus();
  });

  it("shows the session message when saving or removing finds no session", async () => {
    updateRecipe.mockResolvedValue(fail("unauthorized"));
    deleteRecipe.mockResolvedValue(fail("unauthorized"));
    const sheet = openEdit();
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Spara ändringar" })));
    expect(within(sheet).getByRole("alert")).toHaveTextContent("Du behöver logga in.");

    fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort recept" }));
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Ta bort" })));
    expect(within(sheet).getAllByRole("alert").at(-1)).toHaveTextContent("Du behöver logga in.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("says the recipe changed elsewhere and fetches it again", async () => {
    updateRecipe.mockResolvedValue(fail("recipe_conflict"));
    const sheet = openEdit();
    await act(async () => fireEvent.click(within(sheet).getByRole("button", { name: "Spara ändringar" })));
    expect(within(sheet).getByRole("alert")).toHaveTextContent(
      "Receptet har ändrats någon annanstans. Stäng och öppna det igen.",
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says why it cannot save when the problem is in something the form does not show", () => {
    const sheet = openEdit({ ...recipe, imageUrl: "ftp://example.com/bild.jpg" });
    expect(within(sheet).getByText(unshownErrorMessage)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Spara ändringar" })).toBeDisabled();
  });
});
