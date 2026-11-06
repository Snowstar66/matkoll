import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { RecipeListItem } from "../domain/recipe-list";
import { Library, type LibraryOffers } from "./library";
import { OffersSheetControlContext } from "./offers-sheet-control";
import { resetRecipeFilterStore } from "./recipe-filter-store";
import { resetRecipeViewStores } from "./recipe-view-stores";

// The filter Erbjudanden in the library (Story 9.3, 9.10): the pill, the order,
// the tags, the line with "Visa erbjudanden", the AI link once, and the other
// pills unchanged.

vi.mock("../actions/search-recipes", () => ({ searchLibrary: async () => ok({ recipes: [], pantryUnavailable: false, site: null }) }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("../actions/save-recipe", () => ({ saveRecipe: vi.fn() }));
vi.mock("../actions/set-favorite", () => ({ setFavorite: vi.fn() }));

const recipe = (id: number, title: string, missingCount: number | null, overrides: Partial<RecipeListItem> = {}): RecipeListItem => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  title,
  imageUrl: null,
  totalMinutes: 35,
  originalServings: 4,
  isFavorite: false,
  createdAt: `2026-10-0${id}T08:00:00+00:00`,
  missingCount,
  ...overrides,
});

const korv = recipe(1, "Korvstroganoff", 3);
const lax = recipe(2, "Laxpasta", 0);
const gryta = recipe(3, "Grytan med allt", 5);
const ris = recipe(4, "Risotto", 0);
const library = [ris, gryta, lax, korv];

const tags = {
  [korv.id]: ["Falukorv", "Gul lök"],
  [lax.id]: ["Laxfilé"],
  [gryta.id]: ["Falukorv", "Gul lök", "Grädde", "Smör"],
};

function Sheet() {
  const { open } = useContext(OffersSheetControlContext);
  return open ? <div role="dialog" aria-label="Veckans erbjudanden" /> : null;
}

function offers(overrides: Partial<LibraryOffers> = {}): LibraryOffers {
  return {
    tags,
    line: "Recept med veckans erbjudanden, vecka 45.",
    hasOffers: true,
    unlinked: 0,
    sheet: <Sheet />,
    ...overrides,
  };
}

function renderLibrary(props: Partial<LibraryOffers> | null = {}) {
  return render(
    <ToastProvider>
      <Library recipes={library} pantryUnavailable={false} site={null} offers={props === null ? undefined : offers(props)} />
    </ToastProvider>,
  );
}

const titles = () => screen.queryAllByTestId("recipe-card").map((row) => within(row).getByRole("link").textContent);

beforeEach(() => {
  window.localStorage.clear();
  resetRecipeFilterStore();
  resetRecipeViewStores();
  refresh.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Library, the filter Erbjudanden", () => {
  it("has the pill only when the page gives the offers", () => {
    const first = renderLibrary();
    expect(screen.getByRole("button", { name: "Erbjudanden" })).toHaveAttribute("aria-pressed", "false");
    first.unmount();
    renderLibrary(null);
    expect(screen.queryByRole("button", { name: "Erbjudanden" })).not.toBeInTheDocument();
  });

  it("shows only recipes with an offer, most offers first and then fewest missing", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(titles()).toEqual(["Grytan med allt", "Korvstroganoff", "Laxpasta"]);
    expect(screen.getByRole("list", { name: "Recept, flest erbjudanden först" })).toBeInTheDocument();
  });

  it("puts the fewest missing first among recipes with as many offers", async () => {
    const user = userEvent.setup();
    renderLibrary({ tags: { ...tags, [korv.id]: ["Falukorv"], [ris.id]: ["Ris"] } });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(titles()).toEqual(["Grytan med allt", "Risotto", "Laxpasta", "Korvstroganoff"]);
  });

  it("gives a card up to two offer tags and +N", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    const [card] = screen.getAllByTestId("recipe-card");
    const list = within(card).getByRole("list", { name: "Erbjudanden" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Falukorv", "Gul lök", "+2 erbjudanden till"]);
  });

  it("says the week (and the store) and opens the offers sheet with Visa erbjudanden", async () => {
    const user = userEvent.setup();
    renderLibrary({ line: "Recept med veckans erbjudanden från Maxi, vecka 45." });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(screen.getByText("Recept med veckans erbjudanden från Maxi, vecka 45.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Visa erbjudanden" }));
    expect(screen.getByRole("dialog", { name: "Veckans erbjudanden" })).toBeInTheDocument();
  });

  it("says so when no recipe uses an offer, and when no offers are fetched", async () => {
    const user = userEvent.setup();
    const first = renderLibrary({ tags: {} });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(screen.getByText("Inga av dina recept använder veckans erbjudanden.")).toBeInTheDocument();
    first.unmount();
    renderLibrary({ tags: {}, hasOffers: false });
    expect(screen.getByText("Inga erbjudanden hämtade än. Hämta dem i arket.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Visa erbjudanden" })[0]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("leaves Favoriter, Kan lagas nu and Alla as they were, without offer tags", async () => {
    const user = userEvent.setup();
    renderLibrary();
    expect(titles()).toEqual(["Risotto", "Grytan med allt", "Laxpasta", "Korvstroganoff"]);
    expect(screen.queryByTestId("offer-tags")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kan lagas nu" }));
    expect(titles()).toEqual(["Risotto", "Laxpasta"]);
    expect(screen.queryByTestId("offer-tags")).not.toBeInTheDocument();
    expect(screen.queryByTestId("offers-line")).not.toBeInTheDocument();
  });
});

describe("Library, linking offers with the AI (Story 9.10)", () => {
  it("asks once when Erbjudanden is shown with unlinked offers, and shows the new tags by refreshing", async () => {
    const user = userEvent.setup();
    const match = vi.fn(async () => ok({ linked: 2, open: 1 }));
    renderLibrary({ unlinked: 3, match });
    expect(match).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(match).toHaveBeenCalledTimes(1);
  });

  it("does not ask without unlinked offers, and leaves the page alone when nothing was linked", async () => {
    const user = userEvent.setup();
    const none = vi.fn(async () => ok({ linked: 0, open: 0 }));
    const first = renderLibrary({ unlinked: 0, match: none });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    expect(none).not.toHaveBeenCalled();
    first.unmount();
    window.localStorage.clear();
    resetRecipeFilterStore();
    const nothing = vi.fn(async () => ok({ linked: 0, open: 2 }));
    renderLibrary({ unlinked: 2, match: nothing });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    await waitFor(() => expect(nothing).toHaveBeenCalledTimes(1));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("works when the AI call throws", async () => {
    const user = userEvent.setup();
    const match = vi.fn(async () => {
      throw new Error("no answer");
    });
    renderLibrary({ unlinked: 1, match });
    await user.click(screen.getByRole("button", { name: "Erbjudanden" }));
    await waitFor(() => expect(match).toHaveBeenCalledTimes(1));
    expect(titles()).toEqual(["Grytan med allt", "Korvstroganoff", "Laxpasta"]);
  });
});
