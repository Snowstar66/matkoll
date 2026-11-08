import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok, type Result } from "@/lib/errors";
import type { RecipeListItem } from "../domain/recipe-list";
import { toSharedListItems, type SharedListItem } from "../domain/shared-recipe";
import { EmptyLibrary } from "./empty-library";
import { Library } from "./library";
import { resetRecipeFilterStore } from "./recipe-filter-store";
import { resetRecipeViewStores } from "./recipe-view-stores";

// Delade recept in the library (variant B): the chip Delade first in the row, the shared recipes
// as cards with "från …", no heart and no "Saknar", "✓ Sparat" on one saved, and the count.

const searchRecipes = vi.fn<(query: string) => Promise<Result<RecipeListItem[]>>>();
vi.mock("../actions/search-recipes", () => ({
  searchLibrary: async (query: string) => {
    const result = await searchRecipes(query);
    return result.ok ? ok({ recipes: result.data, pantryUnavailable: false, site: null }) : result;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions/delete-recipe", () => ({ deleteRecipe: vi.fn() }));
vi.mock("../actions/set-favorite", () => ({ setFavorite: vi.fn() }));

const own: RecipeListItem = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "Spagettipumpa",
  imageUrl: null,
  totalMinutes: 60,
  originalServings: 4,
  isFavorite: true,
  createdAt: "2026-11-01T08:00:00+00:00",
  missingCount: 1,
};

const shared: SharedListItem[] = toSharedListItems([
  {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Kycklinggryta med tomat och grädde",
    originalServings: 4,
    totalMinutes: 35,
    imageUrl: null,
    householdName: "Lindqvists",
    createdAt: "2026-11-08T08:00:00+00:00",
    savedCopyId: "20000000-0000-4000-8000-000000000001",
    lineTexts: ["600 g kycklingfilé", "2 dl grädde"],
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    title: "Linssoppa",
    originalServings: 4,
    totalMinutes: 30,
    imageUrl: null,
    householdName: "Bergs",
    createdAt: "2026-11-07T08:00:00+00:00",
    savedCopyId: null,
    lineTexts: ["3 dl röda linser"],
  },
]);

function renderLibrary(sharedItems: SharedListItem[] | null = shared) {
  return render(
    <ToastProvider>
      <Library recipes={[own]} pantryUnavailable={false} site={null} shared={sharedItems ?? undefined} />
    </ToastProvider>,
  );
}

const chipNames = () => within(screen.getByTestId("recipe-filters")).getAllByRole("button").map((chip) => chip.textContent);

beforeEach(() => {
  window.localStorage.clear();
  resetRecipeFilterStore();
  resetRecipeViewStores();
  searchRecipes.mockReset().mockResolvedValue(ok([]));
});

describe("Library, Delade", () => {
  it("puts Delade first in the chip row and shows the shared recipes as cards with whose they are", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(chipNames()[0]).toBe("Delade");
    expect(screen.getByTestId("recipe-count")).toHaveTextContent("1 recept");

    await user.click(screen.getByRole("button", { name: "Delade" }));
    expect(screen.getByRole("button", { name: "Delade", pressed: true })).toBeInTheDocument();
    expect(screen.getByTestId("recipe-count")).toHaveTextContent("2 delade recept");
    const cards = screen.getAllByTestId("shared-recipe-card");
    expect(cards.map((card) => within(card).getByRole("link").textContent)).toEqual(["Kycklinggryta med tomat och grädde", "Linssoppa"]);
    expect(within(cards[0]).getByRole("link")).toHaveAttribute("href", "/recept/delade/10000000-0000-4000-8000-000000000001");
    expect(within(cards[0]).getByTestId("recipe-card-byline")).toHaveTextContent("från Lindqvists");
    expect(within(cards[0]).getByTestId("shared-saved")).toHaveTextContent("Sparat");
    expect(within(cards[1]).queryByTestId("shared-saved")).toBeNull();
    // Someone else's recipe: no heart, no Saknar, and the own recipe is not in the list.
    expect(screen.queryByRole("button", { name: /^Favorit,/ })).toBeNull();
    expect(screen.queryByText(/Saknar/)).toBeNull();
    expect(screen.queryByText("Spagettipumpa")).toBeNull();
  });

  it("leaves Delade for an own filter, and combines it with a category", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("button", { name: "Delade" }));
    await user.click(screen.getByRole("button", { name: /Soppa/ }));
    expect(screen.getAllByTestId("shared-recipe-card").map((card) => within(card).getByRole("link").textContent)).toEqual(["Linssoppa"]);
    expect(screen.getByTestId("recipe-count")).toHaveTextContent("1 delat recept");
    await user.click(screen.getByRole("button", { name: /Soppa/ }));
    await user.click(screen.getByRole("button", { name: "Favoriter" }));
    expect(screen.getByRole("button", { name: "Delade", pressed: false })).toBeInTheDocument();
    expect(screen.queryAllByTestId("shared-recipe-card")).toHaveLength(0);
  });

  it("is not there with Visa delade recept off, nor when Delade could not be read", () => {
    window.localStorage.setItem("livskoll-option-showShared", "0");
    const { unmount } = renderLibrary();
    expect(chipNames()).not.toContain("Delade");
    unmount();
    window.localStorage.clear();
    renderLibrary(null);
    expect(chipNames()).not.toContain("Delade");
  });

  it("says when nobody shares anything yet", async () => {
    const user = userEvent.setup();
    renderLibrary([]);
    await user.click(screen.getByRole("button", { name: "Delade" }));
    expect(screen.getByText("Inga delade recept än.")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-count")).toHaveTextContent("0 delade recept");
  });
});

describe("EmptyLibrary", () => {
  it("offers Delade under the empty state when others share, and opens it", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <EmptyLibrary shared={shared}>
          <p>Inga recept än.</p>
        </EmptyLibrary>
      </ToastProvider>,
    );
    expect(screen.getByText("Inga recept än.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Visa delade recept" }));
    expect(screen.getAllByTestId("shared-recipe-card")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Delade" }));
    expect(screen.getByText("Inga recept än.")).toBeInTheDocument();
  });

  it("is only the empty state when nobody shares", () => {
    render(
      <ToastProvider>
        <EmptyLibrary shared={[]}>
          <p>Inga recept än.</p>
        </EmptyLibrary>
      </ToastProvider>,
    );
    expect(screen.queryByRole("button", { name: "Visa delade recept" })).toBeNull();
  });
});
