import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok, type Result } from "@/lib/errors";
import type { FavoriteChange, RecipeListItem } from "../domain/recipe-list";
import { Library } from "./library";
import { recipeFilterStorageKey, resetRecipeFilterStore } from "./recipe-filter-store";

// The library with both Server Actions stubbed. A saved heart makes the
// "server" render the list again, as revalidateFor does in the app.

const searchRecipes = vi.fn<(query: string) => Promise<Result<RecipeListItem[]>>>();
vi.mock("../actions/search-recipes", () => ({ searchRecipes: (query: string) => searchRecipes(query) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const setFavorite = vi.fn<(change: FavoriteChange) => Promise<Result<FavoriteChange>>>();
vi.mock("../actions/set-favorite", () => ({ setFavorite: (change: FavoriteChange) => setFavorite(change) }));

const recipe = (id: number, title: string, overrides: Partial<RecipeListItem> = {}): RecipeListItem => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  title,
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: false,
  missingCount: 0,
  ...overrides,
});

const gryta = recipe(1, "Krämig kycklinggryta", { isFavorite: true });
const soppa = recipe(2, "Linssoppa", { totalMinutes: null, originalServings: 1, missingCount: 2 });

let serverRecipes: RecipeListItem[] = [];
let rerenderServer: ((recipes: RecipeListItem[]) => void) | undefined;

function Server() {
  const [recipes, setRecipes] = useState(serverRecipes);
  useEffect(() => {
    rerenderServer = setRecipes;
  }, []);
  return <Library recipes={recipes} />;
}

function renderLibrary(recipes: RecipeListItem[] = [gryta, soppa]) {
  serverRecipes = recipes;
  return render(
    <ToastProvider>
      <Server />
    </ToastProvider>,
  );
}

const titles = () => screen.queryAllByTestId("recipe-row").map((row) => within(row).getByRole("link").textContent);
const pill = (name: string) => screen.getByRole("radio", { name });

beforeEach(() => {
  window.localStorage.clear();
  resetRecipeFilterStore();
  refresh.mockReset();
  searchRecipes.mockReset().mockResolvedValue(ok([]));
  setFavorite.mockReset().mockImplementation(async (change) => {
    serverRecipes = serverRecipes.map((item) => (item.id === change.id ? { ...item, isFavorite: change.isFavorite } : item));
    act(() => rerenderServer?.(serverRecipes));
    return ok(change);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Library", () => {
  it("shows the rows in the server's order with image, title, time and servings and a heart beside the link", () => {
    renderLibrary();
    expect(titles()).toEqual(["Krämig kycklinggryta", "Linssoppa"]);
    const [first, second] = screen.getAllByTestId("recipe-row");
    expect(within(first).getByRole("link")).toHaveAttribute("href", `/recept/${gryta.id}`);
    expect(within(first).getByText("35 min · 4 portioner")).toBeInTheDocument();
    expect(within(second).getByText("1 portion")).toBeInTheDocument();
    expect(within(first).getByText("Kan lagas nu")).toHaveClass("bg-mint", "text-mint-ink");
    expect(within(second).getByText("Saknar 2 varor")).toHaveClass("bg-sky", "text-sky-ink");
    expect(within(first).getByTestId("recipe-image-placeholder")).toBeInTheDocument();
    const heart = within(first).getByRole("button", { name: "Favorit, Krämig kycklinggryta", pressed: true });
    expect(heart.closest("a")).toBeNull();
    expect(pill("Alla")).toBeChecked();
  });

  it("shows a row without status when the pantry could not be read", () => {
    renderLibrary([recipe(3, "Pannkakor", { missingCount: null })]);
    const [row] = screen.getAllByTestId("recipe-row");
    expect(within(row).queryByText(/^Kan lagas nu$|^Saknar/)).not.toBeInTheDocument();
    expect(within(row).getByText("35 min · 4 portioner")).toBeInTheDocument();
  });

  it("searches after the pause and shows the answer; no hit offers Visa alla recept, which empties the field", async () => {
    const user = userEvent.setup();
    renderLibrary();
    searchRecipes.mockResolvedValueOnce(ok([soppa]));
    await user.type(screen.getByRole("searchbox", { name: "Sök recept" }), "lök");
    await waitFor(() => expect(titles()).toEqual(["Linssoppa"]));
    expect(searchRecipes).toHaveBeenCalledWith("lök");

    searchRecipes.mockResolvedValueOnce(ok([]));
    await user.clear(screen.getByRole("searchbox"));
    expect(titles()).toEqual(["Krämig kycklinggryta", "Linssoppa"]);
    await user.type(screen.getByRole("searchbox"), "xyz");
    await screen.findByText("Inga recept matchar.");
    expect(screen.queryAllByTestId("recipe-row")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Visa alla recept" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(titles()).toEqual(["Krämig kycklinggryta", "Linssoppa"]);
  });

  it("shows only the answer to the latest search", async () => {
    const user = userEvent.setup();
    renderLibrary();
    let answerFirst: (result: Result<RecipeListItem[]>) => void = () => {};
    searchRecipes.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    searchRecipes.mockResolvedValueOnce(ok([gryta]));
    const field = screen.getByRole("searchbox");
    await user.type(field, "so{Enter}");
    await user.type(field, "x{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Krämig kycklinggryta"]));
    await act(async () => answerFirst(ok([soppa])));
    expect(titles()).toEqual(["Krämig kycklinggryta"]);
  });

  it("dims the current rows while a search is on its way", async () => {
    const user = userEvent.setup();
    renderLibrary();
    let answer: (result: Result<RecipeListItem[]>) => void = () => {};
    searchRecipes.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await user.type(screen.getByRole("searchbox"), "so{Enter}");
    const results = screen.getByTestId("library-results");
    expect(results).toHaveAttribute("aria-busy", "true");
    expect(results.className).toContain("opacity-60");
    expect(titles()).toEqual(["Krämig kycklinggryta", "Linssoppa"]);
    await act(async () => answer(ok([soppa])));
    expect(results).toHaveAttribute("aria-busy", "false");
    expect(results.className).not.toContain("opacity-60");
  });

  it("limits the field to the action's 100 characters, and offers no Försök igen for invalid text", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(screen.getByRole("searchbox")).toHaveAttribute("maxlength", "100");
    searchRecipes.mockResolvedValueOnce(fail("validation"));
    await user.type(screen.getByRole("searchbox"), "gryta{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Kontrollera uppgifterna och försök igen.");
    expect(screen.queryByRole("button", { name: "Försök igen" })).not.toBeInTheDocument();
  });

  it("refreshes the page when the session has expired, so it can send Pontus to sign in", async () => {
    const user = userEvent.setup();
    renderLibrary();
    searchRecipes.mockResolvedValueOnce(fail("unauthorized"));
    await user.type(screen.getByRole("searchbox"), "gryta{Enter}");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));

    await user.clear(screen.getByRole("searchbox"));
    setFavorite.mockResolvedValueOnce(fail("unauthorized"));
    await user.click(screen.getByRole("button", { name: "Favorit, Linssoppa" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("says when a search fails and tries again", async () => {
    const user = userEvent.setup();
    renderLibrary();
    searchRecipes.mockResolvedValueOnce(fail("recipe_search_failed")).mockResolvedValueOnce(ok([gryta]));
    await user.type(screen.getByRole("searchbox"), "gryta{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att söka bland recepten. Försök igen.");
    await user.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(titles()).toEqual(["Krämig kycklinggryta"]));
    expect(searchRecipes).toHaveBeenLastCalledWith("gryta");
  });

  it("filters on Favoriter, keeps the choice on the device, and has an empty state without favourites", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLibrary();
    await user.click(pill("Favoriter"));
    expect(pill("Favoriter")).toBeChecked();
    expect(titles()).toEqual(["Krämig kycklinggryta"]);
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("favorites");
    unmount();

    renderLibrary([soppa]);
    expect(pill("Favoriter")).toBeChecked();
    expect(screen.getByText("Inga favoriter än. Tryck på hjärtat på ett recept.")).toBeInTheDocument();
  });

  it("filters the search answer on Favoriter too", async () => {
    const user = userEvent.setup();
    renderLibrary();
    searchRecipes.mockResolvedValue(ok([gryta, soppa]));
    await user.click(pill("Favoriter"));
    await user.type(screen.getByRole("searchbox"), "a{Enter}");
    await waitFor(() => expect(searchRecipes).toHaveBeenCalled());
    expect(titles()).toEqual(["Krämig kycklinggryta"]);
    searchRecipes.mockResolvedValue(ok([soppa]));
    await user.type(screen.getByRole("searchbox"), "b{Enter}");
    expect(await screen.findByText("Inga recept matchar.")).toBeInTheDocument();
  });

  it("uses Alla when localStorage cannot be read, and still switches", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    renderLibrary();
    expect(pill("Alla")).toBeChecked();
    await user.click(pill("Favoriter"));
    expect(pill("Favoriter")).toBeChecked();
    await user.click(pill("Alla"));
    expect(pill("Alla")).toBeChecked();
  });

  it("toggles a heart at once and saves it", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("button", { name: "Favorit, Linssoppa", pressed: false }));
    expect(setFavorite).toHaveBeenCalledWith({ id: soppa.id, isFavorite: true });
    expect(await screen.findByRole("button", { name: "Favorit, Linssoppa", pressed: true })).toBeInTheDocument();
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("puts the heart back and says so when saving fails", async () => {
    const user = userEvent.setup();
    renderLibrary();
    let answer: (result: Result<FavoriteChange>) => void = () => {};
    setFavorite.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await user.click(screen.getByRole("button", { name: "Favorit, Linssoppa" }));
    // Shown at once, before the server answers.
    expect(screen.getByRole("button", { name: "Favorit, Linssoppa", pressed: true })).toBeInTheDocument();
    await act(async () => answer(fail("recipe_favorite_failed")));
    expect(screen.getByRole("button", { name: "Favorit, Linssoppa", pressed: false })).toBeInTheDocument();
    expect(screen.getByTestId("toast")).toHaveTextContent("Det gick inte att spara favoriten.");
  });

  it("keeps a heart tapped on a search hit, with the saved value from the server list, also under Favoriter", async () => {
    const user = userEvent.setup();
    renderLibrary();
    // The search answer is older than the server list will be after the save.
    searchRecipes.mockResolvedValue(ok([{ ...soppa, isFavorite: false }]));
    await user.type(screen.getByRole("searchbox"), "lins{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Linssoppa"]));
    await user.click(screen.getByRole("button", { name: "Favorit, Linssoppa", pressed: false }));
    expect(setFavorite).toHaveBeenCalledWith({ id: soppa.id, isFavorite: true });
    await waitFor(() => expect(serverRecipes.find(({ id }) => id === soppa.id)?.isFavorite).toBe(true));
    expect(await screen.findByRole("button", { name: "Favorit, Linssoppa", pressed: true })).toBeInTheDocument();
    await user.click(pill("Favoriter"));
    expect(titles()).toEqual(["Linssoppa"]);
    expect(screen.getByRole("button", { name: "Favorit, Linssoppa", pressed: true })).toBeInTheDocument();
  });

  it("says nothing when an earlier tap failed but the latest one was saved", async () => {
    const user = userEvent.setup();
    renderLibrary();
    let answerFirst: (result: Result<FavoriteChange>) => void = () => {};
    setFavorite.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    const heart = () => screen.getByRole("button", { name: /^Favorit, Linssoppa/ });
    await user.click(heart());
    await user.click(heart());
    await act(async () => answerFirst(fail("recipe_favorite_failed")));
    await waitFor(() => expect(setFavorite).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("toast")).not.toBeInTheDocument();
  });

  it("treats a lost connection like a failed save", async () => {
    const user = userEvent.setup();
    renderLibrary();
    setFavorite.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await user.click(screen.getByRole("button", { name: "Favorit, Krämig kycklinggryta" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Det gick inte att spara favoriten.");
    expect(screen.getByRole("button", { name: "Favorit, Krämig kycklinggryta", pressed: true })).toBeInTheDocument();
  });
});
