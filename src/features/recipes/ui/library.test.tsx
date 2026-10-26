import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import type { SelectedSite } from "@/features/pantry";
import { fail, ok, type Result } from "@/lib/errors";
import type { FavoriteChange, RecipeListItem } from "../domain/recipe-list";
import { Library } from "./library";
import { recipeFilterStorageKey, resetRecipeFilterStore } from "./recipe-filter-store";

// The library with both Server Actions stubbed. A saved heart makes the
// "server" render the list again, as revalidateFor does in the app.
// `searchRecipes` stubs the recipes searchLibrary answers with, and
// `searchPantryUnavailable` whether its pantry could be read.

const searchRecipes = vi.fn<(query: string) => Promise<Result<RecipeListItem[]>>>();
let searchPantryUnavailable = false;
/** The place searchLibrary's answer was counted against. */
let searchSite: SelectedSite | null = null;
vi.mock("../actions/search-recipes", () => ({
  searchLibrary: async (query: string) => {
    const result = await searchRecipes(query);
    return result.ok ? ok({ recipes: result.data, pantryUnavailable: searchPantryUnavailable, site: searchSite }) : result;
  },
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
/** /api/ai/suggest, behind "Föreslå rätter med AI" (ai-suggestions.test.tsx has the rest). */
const postAi = vi.fn<(path: string, body: unknown, signal: AbortSignal) => Promise<unknown>>();
vi.mock("@/lib/ai-client", () => ({
  postAi: (path: string, body: unknown, signal: AbortSignal) => postAi(path, body, signal),
}));
vi.mock("../actions/save-recipe", () => ({ saveRecipe: vi.fn() }));
const setFavorite = vi.fn<(change: FavoriteChange) => Promise<Result<FavoriteChange>>>();
vi.mock("../actions/set-favorite", () => ({ setFavorite: (change: FavoriteChange) => setFavorite(change) }));

const recipe = (id: number, title: string, overrides: Partial<RecipeListItem> = {}): RecipeListItem => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  title,
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: false,
  createdAt: `2026-10-0${id}T08:00:00+00:00`,
  missingCount: 0,
  ...overrides,
});

const gryta = recipe(1, "Krämig kycklinggryta", { isFavorite: true, createdAt: "2026-10-03T08:00:00+00:00" });
const soppa = recipe(2, "Linssoppa", {
  totalMinutes: null,
  originalServings: 1,
  missingCount: 2,
  createdAt: "2026-10-04T08:00:00+00:00",
});
const pannkakor = recipe(3, "Pannkakor", { missingCount: 1, createdAt: "2026-10-02T08:00:00+00:00" });
const fisk = recipe(4, "Fiskgratäng", { missingCount: 0, createdAt: "2026-10-01T08:00:00+00:00" });
/** Newest first, as the server gives them: N = 2, 0, 1 and 0. */
const ranking = [soppa, gryta, pannkakor, fisk];

let serverRecipes: RecipeListItem[] = [];
let rerenderServer: ((recipes: RecipeListItem[]) => void) | undefined;
/** Renders the "server" list again with another place, as a place selected elsewhere does. */
let rerenderSite: ((site: SelectedSite | null) => void) | undefined;
let serverPantryUnavailable = false;
let serverSite: SelectedSite | null = null;
const searchIngredients = vi.fn(async () => ok([]));

function Server() {
  const [recipes, setRecipes] = useState(serverRecipes);
  const [site, setSite] = useState(serverSite);
  useEffect(() => {
    rerenderServer = setRecipes;
    rerenderSite = setSite;
  }, []);
  return (
    <Library
      recipes={recipes}
      pantryUnavailable={serverPantryUnavailable}
      site={site}
      searchIngredients={searchIngredients}
    />
  );
}

type RenderOptions = { pantryUnavailable?: boolean; site?: SelectedSite | null };

function renderLibrary(recipes: RecipeListItem[] = [gryta, soppa], options: RenderOptions = {}) {
  serverRecipes = recipes;
  serverPantryUnavailable = options.pantryUnavailable ?? false;
  serverSite = options.site ?? null;
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
  postAi.mockReset().mockReturnValue(new Promise(() => {}));
  searchPantryUnavailable = false;
  searchSite = null;
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

const stugan: SelectedSite = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };

describe("Library, the line Lager", () => {
  it("says which place Kan lagas nu counts against, only in Kan lagas nu", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { site: stugan });
    expect(screen.queryByText("Lager: Stugan")).not.toBeInTheDocument();
    await user.click(pill("Kan lagas nu"));
    const line = screen.getByText("Lager: Stugan");
    expect(line).toHaveClass("text-meta", "text-ink-2");
    // Metadata, not announced: outside every live region.
    expect(line.closest("[aria-live], [role=status], [role=alert]")).toBeNull();
    await user.click(pill("Favoriter"));
    expect(screen.queryByText("Lager: Stugan")).not.toBeInTheDocument();
    await user.click(pill("Alla"));
    expect(screen.queryByText("Lager: Stugan")).not.toBeInTheDocument();
    // The badges are counted against Stugan all the same.
    expect(screen.getAllByText("Kan lagas nu", { selector: "span" }).length).toBeGreaterThan(0);
  });

  it("has no line with one place", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { site: { ...stugan, name: "Hemma", siteCount: 1 } });
    await user.click(pill("Kan lagas nu"));
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
  });

  it("has no line when the pantry could not be read", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { pantryUnavailable: true, site: null });
    await user.click(pill("Kan lagas nu"));
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
  });

  it("names the search answer's place while its recipes are shown, also when it differs from the server's", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { site: stugan });
    await user.click(pill("Kan lagas nu"));
    searchSite = { ...stugan, name: "Hemma" };
    searchRecipes.mockResolvedValueOnce(ok([soppa]));
    await user.type(screen.getByRole("searchbox", { name: "Sök recept" }), "lin{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Linssoppa"]));
    expect(screen.getByText("Lager: Hemma")).toBeInTheDocument();
    expect(screen.queryByText("Lager: Stugan")).not.toBeInTheDocument();
    // Back to the server's list: the server's place.
    await user.clear(screen.getByRole("searchbox"));
    expect(await screen.findByText("Lager: Stugan")).toBeInTheDocument();
  });

  it("has no line on no hits, after a failed search, or when the search could not read the pantry", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { site: stugan });
    await user.click(pill("Kan lagas nu"));
    const field = screen.getByRole("searchbox", { name: "Sök recept" });

    searchSite = stugan;
    searchRecipes.mockResolvedValueOnce(ok([]));
    await user.type(field, "xyz{Enter}");
    await screen.findByText("Inga recept matchar.");
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();

    searchRecipes.mockResolvedValueOnce(fail("recipe_search_failed"));
    await user.clear(field);
    await user.type(field, "lin{Enter}");
    await screen.findByRole("alert");
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();

    searchPantryUnavailable = true;
    searchRecipes.mockResolvedValueOnce(ok([{ ...soppa, missingCount: null }]));
    await user.clear(field);
    await user.type(field, "sop{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Linssoppa"]));
    expect(screen.queryByText(/^Lager:/)).not.toBeInTheDocument();
  });

  it("follows the search answer when the server list had no status", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { pantryUnavailable: true, site: null });
    await user.click(pill("Kan lagas nu"));
    searchSite = stugan;
    searchRecipes.mockResolvedValueOnce(ok([soppa]));
    await user.type(screen.getByRole("searchbox", { name: "Sök recept" }), "lin{Enter}");
    expect(await screen.findByText("Lager: Stugan")).toBeInTheDocument();
  });
});

describe("Library, AI-förslag and the place", () => {
  const draft = {
    title: "Ugnsomelett",
    servings: 4,
    totalMinutes: 40,
    imageUrl: null,
    sourceKind: "ai",
    sourceUrl: null,
    steps: ["Grädda."],
    lines: [],
  };
  const suggestion = () => screen.queryByRole("heading", { level: 3, name: "Ugnsomelett" });

  it("hides the suggestions while the library shows another place than they were made from, and shows them again", async () => {
    const user = userEvent.setup();
    const hemma: SelectedSite = { ...stugan, id: "66666666-6666-4666-8666-666666666666", name: "Hemma" };
    postAi.mockResolvedValueOnce(ok({ suggestions: [{ draft, ingredientNames: {} }], siteId: stugan.id }));
    renderLibrary(ranking, { site: stugan });
    await user.click(pill("Kan lagas nu"));
    await user.click(screen.getByRole("button", { name: "Föreslå rätter med AI" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Ugnsomelett" })).toBeInTheDocument();

    act(() => rerenderSite?.(hemma));
    expect(suggestion()).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();

    act(() => rerenderSite?.(stugan));
    expect(suggestion()).toBeInTheDocument();
  });

  it("keeps the suggestions when the library's place is not known", async () => {
    const user = userEvent.setup();
    postAi.mockResolvedValueOnce(ok({ suggestions: [{ draft, ingredientNames: {} }], siteId: stugan.id }));
    renderLibrary(ranking, { site: stugan });
    await user.click(pill("Kan lagas nu"));
    await user.click(screen.getByRole("button", { name: "Föreslå rätter med AI" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Ugnsomelett" })).toBeInTheDocument();
    act(() => rerenderSite?.(null));
    expect(suggestion()).toBeInTheDocument();
  });
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

  it("has three pills, Alla first", () => {
    renderLibrary();
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Alla", "Favoriter", "Kan lagas nu"]);
    expect(screen.getByRole("list", { name: "Recept" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  it("ranks every recipe on Kan lagas nu, fewest missing first and newest first within, and keeps the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLibrary(ranking);
    expect(titles()).toEqual(["Linssoppa", "Krämig kycklinggryta", "Pannkakor", "Fiskgratäng"]);
    await user.click(pill("Kan lagas nu"));
    expect(pill("Kan lagas nu")).toBeChecked();
    expect(titles()).toEqual(["Krämig kycklinggryta", "Fiskgratäng", "Pannkakor", "Linssoppa"]);
    expect(screen.getByRole("list", { name: "Recept, minst saknat först" })).toBeInTheDocument();
    expect(window.localStorage.getItem(recipeFilterStorageKey)).toBe("cookable");
    unmount();

    renderLibrary(ranking);
    expect(pill("Kan lagas nu")).toBeChecked();
    expect(titles()).toEqual(["Krämig kycklinggryta", "Fiskgratäng", "Pannkakor", "Linssoppa"]);
  });

  it("ranks again when the server list comes back with new statuses (the pantry changed)", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    expect(titles()).toEqual(["Krämig kycklinggryta", "Fiskgratäng", "Pannkakor", "Linssoppa"]);
    act(() => rerenderServer?.(ranking.map((item) => (item.id === soppa.id ? { ...item, missingCount: 0 } : item))));
    expect(titles()).toEqual(["Linssoppa", "Krämig kycklinggryta", "Fiskgratäng", "Pannkakor"]);
    const [first] = screen.getAllByTestId("recipe-row");
    expect(within(first).getByText("Kan lagas nu")).toBeInTheDocument();
  });

  it("chooses Kan lagas nu with the right arrow from Favoriter", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Favoriter"));
    expect(pill("Favoriter")).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(pill("Kan lagas nu")).toBeChecked();
    expect(pill("Kan lagas nu")).toHaveFocus();
    expect(titles()).toEqual(["Krämig kycklinggryta", "Fiskgratäng", "Pannkakor", "Linssoppa"]);
  });

  it("offers Föreslå rätter med AI when the pantry could not be read too, since the server reads it again", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking, { pantryUnavailable: true });
    await user.click(pill("Kan lagas nu"));
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();
  });

  it("asks the AI only when the button is pressed, never on a pill or a render", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    await user.click(pill("Alla"));
    await user.click(pill("Kan lagas nu"));
    expect(postAi).not.toHaveBeenCalled();
  });

  it("keeps the AI suggestions while the pills change", async () => {
    const user = userEvent.setup();
    const draft = {
      title: "Ugnsomelett",
      servings: 4,
      totalMinutes: 40,
      imageUrl: null,
      sourceKind: "ai",
      sourceUrl: null,
      steps: ["Grädda."],
      lines: [],
    };
    postAi.mockResolvedValueOnce(ok({ suggestions: [{ draft, ingredientNames: {} }] }));
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    await user.click(screen.getByRole("button", { name: "Föreslå rätter med AI" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Ugnsomelett" })).toBeInTheDocument();
    await user.click(pill("Alla"));
    expect(screen.queryByRole("region", { name: "AI-förslag" })).not.toBeInTheDocument();
    await user.click(pill("Kan lagas nu"));
    expect(within(screen.getByRole("region", { name: "AI-förslag" })).getByRole("heading", { name: "Ugnsomelett" })).toBeInTheDocument();
    // Shown again, the section does not take focus from the pill.
    expect(pill("Kan lagas nu")).toHaveFocus();
    // The suggestion is not a row of the library.
    expect(titles()).not.toContain("Ugnsomelett");
    expect(postAi).toHaveBeenCalledTimes(1);
  });

  it("has Föreslå rätter med AI at the bottom only on Kan lagas nu, also when nothing can be cooked now", async () => {
    const user = userEvent.setup();
    renderLibrary([soppa, pannkakor]);
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
    await user.click(pill("Kan lagas nu"));
    expect(titles()).toEqual(["Pannkakor", "Linssoppa"]);
    for (const row of screen.getAllByTestId("recipe-row")) expect(within(row).queryByText("Kan lagas nu")).toBeNull();
    const button = screen.getByRole("button", { name: "Föreslå rätter med AI" });
    expect(button).toHaveAttribute("type", "button");
    // After the list.
    const list = screen.getByRole("list", { name: "Recept, minst saknat först" });
    expect(list.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(button);
    expect(postAi).toHaveBeenCalledWith("/api/ai/suggest", { avoidTitles: [] }, expect.any(AbortSignal));
    expect(searchRecipes).not.toHaveBeenCalled();

    await user.click(pill("Alla"));
    expect(titles()).toEqual(["Linssoppa", "Pannkakor"]);
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
    expect(screen.queryByText("Letar efter idéer …")).not.toBeInTheDocument();
    await user.click(pill("Favoriter"));
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  it("keeps the AI button outside the dimmed results while a search is on its way", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    let answer: (result: Result<RecipeListItem[]>) => void = () => {};
    searchRecipes.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    await user.type(screen.getByRole("searchbox"), "so{Enter}");
    const results = screen.getByTestId("library-results");
    expect(results).toHaveAttribute("aria-busy", "true");
    const button = screen.getByRole("button", { name: "Föreslå rätter med AI" });
    expect(results).not.toContainElement(button);
    expect(button).toBeEnabled();
    await act(async () => answer(ok([soppa])));
    expect(results).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();
  });

  it("ranks the search hits on Kan lagas nu, with the button under them", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    searchRecipes.mockResolvedValueOnce(ok([soppa, pannkakor, fisk]));
    await user.type(screen.getByRole("searchbox"), "lök{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Fiskgratäng", "Pannkakor", "Linssoppa"]));
    expect(searchRecipes).toHaveBeenCalledWith("lök");
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();
  });

  it("keeps the button under no hit, but not under a failed search", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    searchRecipes.mockResolvedValueOnce(ok([]));
    await user.type(screen.getByRole("searchbox"), "xyz{Enter}");
    expect(await screen.findByText("Inga recept matchar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Visa alla recept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Föreslå rätter med AI" })).toBeInTheDocument();

    searchRecipes.mockResolvedValueOnce(fail("recipe_search_failed"));
    await user.type(screen.getByRole("searchbox"), "z{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att söka bland recepten. Försök igen.");
    expect(screen.getByRole("button", { name: "Försök igen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  it("keeps the progress and Avbryt of a call on its way when a search fails", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    await user.click(pill("Kan lagas nu"));
    await user.click(screen.getByRole("button", { name: "Föreslå rätter med AI" }));
    searchRecipes.mockResolvedValueOnce(fail("recipe_search_failed"));
    await user.type(screen.getByRole("searchbox"), "z{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Det gick inte att söka bland recepten. Försök igen.");

    const section = screen.getByTestId("ai-suggestions");
    expect(within(section).getByRole("status")).toHaveTextContent("Letar efter idéer …");
    await user.click(within(section).getByRole("button", { name: "Avbryt" }));
    expect(postAi.mock.calls[0][2].aborted).toBe(true);
    expect(within(section).getByRole("status")).toBeEmptyDOMElement();
    // Under the failed search, the button is not offered.
    expect(screen.queryByRole("button", { name: "Föreslå rätter med AI" })).not.toBeInTheDocument();
  });

  const notRanked = "Det gick inte att läsa lagret, så recepten är inte rangordnade.";

  it("shows the recipes in the usual order with a notice on Kan lagas nu when the pantry could not be read", async () => {
    const user = userEvent.setup();
    const unread = ranking.map((item) => ({ ...item, missingCount: null }));
    renderLibrary(unread, { pantryUnavailable: true });
    expect(screen.queryByText(notRanked)).not.toBeInTheDocument();
    await user.click(pill("Kan lagas nu"));
    expect(titles()).toEqual(["Linssoppa", "Krämig kycklinggryta", "Pannkakor", "Fiskgratäng"]);
    const notice = screen.getByText(notRanked);
    expect(notice.closest('[role="status"]')).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Over the rows, and the list does not claim a ranking it lacks.
    const list = screen.getByRole("list", { name: "Recept" });
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const row of screen.getAllByTestId("recipe-row")) {
      expect(within(row).queryByText(/^Kan lagas nu$|^Saknar/)).not.toBeInTheDocument();
    }

    await user.click(pill("Alla"));
    expect(screen.queryByText(notRanked)).not.toBeInTheDocument();
  });

  it("keeps the status region in Kan lagas nu and fills it only when the pantry could not be read", async () => {
    const user = userEvent.setup();
    renderLibrary(ranking);
    const results = screen.getByTestId("library-results");
    expect(within(results).queryByRole("status")).not.toBeInTheDocument();
    await user.click(pill("Kan lagas nu"));
    expect(within(results).getByRole("status")).toBeEmptyDOMElement();
  });

  it("ranks rows without a status last, without the notice, when the pantry was read", async () => {
    const user = userEvent.setup();
    // Newest first: no status, 2, no status, 0.
    const mixed = [
      { ...soppa, missingCount: null },
      { ...gryta, missingCount: 2 },
      { ...pannkakor, missingCount: null },
      fisk,
    ];
    renderLibrary(mixed);
    await user.click(pill("Kan lagas nu"));
    expect(titles()).toEqual(["Fiskgratäng", "Krämig kycklinggryta", "Linssoppa", "Pannkakor"]);
    expect(screen.getByRole("list", { name: "Recept, minst saknat först" })).toBeInTheDocument();
    expect(screen.queryByText(notRanked)).not.toBeInTheDocument();
  });

  it("shows the notice for a search only when neither the list nor the search could read the pantry", async () => {
    const user = userEvent.setup();
    const unread = ranking.map((item) => ({ ...item, missingCount: null }));
    renderLibrary(unread, { pantryUnavailable: true });
    await user.click(pill("Kan lagas nu"));
    searchPantryUnavailable = true;
    searchRecipes.mockResolvedValueOnce(ok([unread[0], unread[2]]));
    await user.type(screen.getByRole("searchbox"), "a{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Linssoppa", "Pannkakor"]));
    expect(screen.getByText(notRanked)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Recept" })).toBeInTheDocument();

    // A recipe saved since the page was rendered, found with a readable pantry.
    searchPantryUnavailable = false;
    const nytt = recipe(5, "Omelett", { missingCount: 1 });
    searchRecipes.mockResolvedValueOnce(ok([unread[0], nytt]));
    await user.type(screen.getByRole("searchbox"), "b{Enter}");
    await waitFor(() => expect(titles()).toEqual(["Omelett", "Linssoppa"]));
    expect(screen.queryByText(notRanked)).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Recept, minst saknat först" })).toBeInTheDocument();
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
    // The heart goes back once the failed save's transition has settled.
    expect(await screen.findByRole("button", { name: "Favorit, Krämig kycklinggryta", pressed: true })).toBeInTheDocument();
  });
});
