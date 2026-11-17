import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import { saveOption } from "@/lib/options";
import type { RecipeListItem } from "../domain/recipe-list";
import { Library } from "./library";
import { resetRecipeFilterStore } from "./recipe-filter-store";
import { resetRecipeViewStores } from "./recipe-view-stores";

// The chip "<500 kcal" in the library: the rule, the missing-kcal section, the lead line, the empty state,
// the Tillval switch and the combination with a category.

vi.mock("../actions/search-recipes", () => ({ searchLibrary: async () => ok({ recipes: [], pantryUnavailable: false, site: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions/save-recipe", () => ({ saveRecipe: vi.fn() }));
vi.mock("../actions/set-favorite", () => ({ setFavorite: vi.fn() }));

const recipe = (id: number, title: string, overrides: Partial<RecipeListItem> = {}): RecipeListItem => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  title,
  imageUrl: null,
  totalMinutes: 30,
  originalServings: 4,
  isFavorite: false,
  createdAt: `2026-10-0${id}T08:00:00+00:00`,
  missingCount: 0,
  ...overrides,
});

const lax = recipe(1, "Lax", { categories: ["fish"] });
const curry = recipe(2, "Curry", { categories: ["fish"] });
const soppa = recipe(3, "Soppa");
const mormor = recipe(4, "Mormors hemlighet");
const borderline = recipe(5, "Nästan femhundra");
const all = [borderline, mormor, soppa, curry, lax];
// 500 is "ca 500": not included. Soppa and Mormor have no reliable figure.
const figures = { [lax.id]: 470, [curry.id]: 680, [soppa.id]: null, [borderline.id]: 500 };

async function renderLibrary(kcal: Record<string, number | null> | undefined | "none" = figures, recipes = all) {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(
    <ToastProvider>
      <Library
        recipes={recipes}
        pantryUnavailable={false}
        site={null}
        kcal={kcal === "none" ? undefined : Promise.resolve(kcal)}
      />
    </ToastProvider>,
    );
  });
  return view;
}

const titles = (id = "recipe-card") => screen.queryAllByTestId(id).map((row) => within(row).getByRole("link").textContent);

beforeEach(() => {
  window.localStorage.clear();
  resetRecipeFilterStore();
  resetRecipeViewStores();
  saveOption("showNutrition", true);
  saveOption("showKcal", true);
});

describe("Library, the chip <500 kcal", () => {
  it("is there with Visa kcal on and the kcal read, and not otherwise", async () => {
    const first = await renderLibrary();
    expect(await screen.findByRole("button", { name: "<500 kcal" })).toHaveAttribute("aria-pressed", "false");
    first.unmount();
    saveOption("showKcal", false);
    const second = await renderLibrary();
    await waitFor(() => expect(screen.getByTestId("recipe-filters")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "<500 kcal" })).not.toBeInTheDocument();
    second.unmount();
    saveOption("showKcal", true);
    await renderLibrary("none");
    expect(screen.queryByRole("button", { name: "<500 kcal" })).not.toBeInTheDocument();
  });

  it("shows only recipes under 500 first, with the lead line and kcal on the cards, then Kcal saknas last", async () => {
    const user = userEvent.setup();
    await renderLibrary();
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    expect(screen.getByText("Under 500 kcal per portion")).toBeInTheDocument();
    const lists = screen.getAllByRole("list", { name: "Recept" });
    expect(lists).toHaveLength(2);
    expect(within(lists[0]).getAllByTestId("recipe-card").map((card) => within(card).getByRole("link").textContent)).toEqual(["Lax"]);
    expect(within(lists[0]).getByTestId("kcal-line")).toHaveTextContent("ca 470 kcal");
    expect(screen.getByRole("heading", { name: "Kcal saknas · 2" })).toBeInTheDocument();
    expect(within(lists[1]).getAllByTestId("recipe-card").map((card) => within(card).getByRole("link").textContent)).toEqual(["Mormors hemlighet", "Soppa"]);
    for (const line of within(lists[1]).getAllByTestId("kcal-line")) expect(line).toHaveTextContent("kcal saknas");
    // Curry (680) and the ca 500 recipe are not listed; the count is of the recipes under 500.
    expect(titles()).not.toContain("Curry");
    expect(titles()).not.toContain("Nästan femhundra");
    expect(screen.getByText("1 recept")).toBeInTheDocument();
  });

  it("shows no lead line, section or kcal on the cards when the chip is not chosen", async () => {
    await renderLibrary();
    await screen.findByRole("button", { name: "<500 kcal" });
    expect(screen.queryByText("Under 500 kcal per portion")).not.toBeInTheDocument();
    expect(screen.queryByTestId("kcal-missing")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId("kcal-line")).toHaveLength(0);
  });

  it("says so when nothing is under 500, with the missing ones still listed", async () => {
    const user = userEvent.setup();
    await renderLibrary({ [lax.id]: 500, [curry.id]: 680, [soppa.id]: null });
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    expect(screen.getByText("Inga recept under 500 kcal ännu.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kcal saknas · 3" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Visa alla" })).not.toBeInTheDocument();
  });

  it("offers Visa alla when no recipe is under 500 and none lacks kcal", async () => {
    const user = userEvent.setup();
    await renderLibrary({ [lax.id]: 600, [curry.id]: 680 }, [curry, lax]);
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    expect(screen.getByText("Inga recept under 500 kcal ännu.")).toBeInTheDocument();
    expect(screen.queryByTestId("kcal-missing")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Visa alla" }));
    expect(screen.getByRole("button", { name: "<500 kcal" })).toHaveAttribute("aria-pressed", "false");
    expect(titles()).toHaveLength(2);
  });

  it("combines with a category and is one at a time with the other filters", async () => {
    const user = userEvent.setup();
    await renderLibrary({ [lax.id]: 470, [curry.id]: null, [soppa.id]: 300, [mormor.id]: null, [borderline.id]: 450 });
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    expect(titles()).toEqual(["Nästan femhundra", "Soppa", "Lax", "Mormors hemlighet", "Curry"]);
    await user.click(screen.getByRole("button", { name: /Fisk/i }));
    expect(screen.getByRole("heading", { name: "Kcal saknas · 1" })).toBeInTheDocument();
    expect(titles()).toEqual(["Lax", "Curry"]);
    await user.click(screen.getByRole("button", { name: "Favoriter" }));
    expect(screen.getByRole("button", { name: "<500 kcal" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("Under 500 kcal per portion")).not.toBeInTheDocument();
  });

  it("treats a saved <500 kcal as Alla when Visa kcal is off", async () => {
    const user = userEvent.setup();
    const first = await renderLibrary();
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    first.unmount();
    saveOption("showKcal", false);
    await renderLibrary();
    await waitFor(() => expect(titles()).toHaveLength(5));
    expect(screen.queryByText("Under 500 kcal per portion")).not.toBeInTheDocument();
  });

  it("shows kcal on the rows of the compact list", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("matkoll.recept.vy", "compact");
    await renderLibrary();
    await user.click(await screen.findByRole("button", { name: "<500 kcal" }));
    const rows = screen.getAllByTestId("recipe-row");
    expect(rows[0]).toHaveTextContent("4 port. · ca 470 kcal");
    expect(rows[1]).toHaveTextContent("kcal saknas");
  });
});
