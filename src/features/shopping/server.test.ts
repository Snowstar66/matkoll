import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentWeekStart } from "@/features/mealplan";
import { toSnapshot } from "@/features/pantry";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "./data/client";

// getShoppingList with the other modules' server entries stubbed: the list is
// counted from them, a pantry that cannot be read leaves nothing taken off,
// and any other source that fails gives shopping_unavailable. The selected
// store and its product choices (Story 7.2) come beside the list, and when
// they cannot be read the list is given all the same.

const { CatalogDataError, MealPlanDataError, PantryDataError, RecipeDataError, SettingsDataError } = vi.hoisted(() => {
  class DataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  }
  class CatalogDataError extends Error {
    constructor(
      readonly code: string,
      readonly detail?: string,
    ) {
      super(code);
    }
  }
  return {
    CatalogDataError,
    MealPlanDataError: class extends DataError {},
    PantryDataError: class extends DataError {},
    RecipeDataError: class extends DataError {},
    SettingsDataError: class extends DataError {},
  };
});
const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const getCurrentPlan = vi.fn();
const getPlanForWeek = vi.fn();
vi.mock("@/features/mealplan/server", () => ({
  MealPlanDataError,
  getCurrentPlan: () => getCurrentPlan(),
  getPlanForWeek: (...args: unknown[]) => getPlanForWeek(...args),
}));
const getRecipesByIds = vi.fn();
vi.mock("@/features/recipes/server", () => ({
  RecipeDataError,
  getRecipesByIds: (ids: string[]) => getRecipesByIds(ids),
}));
const getPantrySnapshot = vi.fn();
const getSelectedSite = vi.fn();
const findPantryAdditions = vi.fn();
vi.mock("@/features/pantry/server", () => ({
  PantryDataError,
  // pantry.getPantryForStatus as pantry/server.test.ts shows it: the selected
  // place once, then that place's pantry, and neither when one cannot be read.
  getPantryForStatus: async () => {
    try {
      const site = await getSelectedSite();
      return { site, snapshot: await getPantrySnapshot(site?.id) };
    } catch (error) {
      if (!(error instanceof PantryDataError)) throw error;
      console.error("pantry_unavailable", { reason: error.detail });
      return { site: null, snapshot: null };
    }
  },
  findPantryAdditions: (keys: string[]) => findPantryAdditions(keys),
}));
const getIngredientNames = vi.fn();
const getIngredientDefaults = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  getIngredientNames: (ids: string[]) => getIngredientNames(ids),
  getIngredientDefaults: (ids: string[]) => getIngredientDefaults(ids),
}));

const getSelectedStore = vi.fn();
vi.mock("@/features/settings/server", () => ({ SettingsDataError, getSelectedStore: () => getSelectedStore() }));

const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const listChecksIn = vi.fn();
// The checks' keys from listChecksIn's stub, with ids as listCheckRowsIn reads them.
vi.mock("./data/checks", () => ({
  listCheckRowsIn: async (...args: unknown[]) =>
    ((await listChecksIn(...args)) as string[]).map((key, index) => ({ id: `check-${index}`, key })),
}));
const listCustomItemsIn = vi.fn();
vi.mock("./data/custom-items", () => ({ listCustomItemsIn: (...args: unknown[]) => listCustomItemsIn(...args) }));
const listOverridesIn = vi.fn();
vi.mock("./data/overrides", () => ({ listOverridesIn: (...args: unknown[]) => listOverridesIn(...args) }));
const listProductChoicesIn = vi.fn();
vi.mock("./data/product-choices", () => ({ listProductChoicesIn: (...args: unknown[]) => listProductChoicesIn(...args) }));

const { getShoppingList } = await import("./server");

const recipeId = "11111111-1111-4111-8111-111111111111";
const gradde = "22222222-2222-4222-8222-222222222222";
const plan = {
  id: "plan",
  name: "Vecka 44",
  recipes: [
    { id: "d1", recipeId, recipeTitle: "Krämig kycklinggryta", servings: 6, position: 0 },
    { id: "d2", recipeId: null, recipeTitle: "Borttaget", servings: 2, position: 1 },
  ],
};
const recipe = {
  id: recipeId,
  originalServings: 4,
  lines: [{ id: "l1", ingredientId: gradde, amount: 2, unit: "dl", isVague: false, originalText: "2 dl grädde" }],
};

const store = {
  id: "66666666-6666-4666-8666-666666666666",
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  externalStoreId: "1003733",
  address: null,
  url: "https://handlaprivatkund.ica.se/stores/1003733",
  isSelected: true,
};
const choice = {
  id: "77777777-7777-4777-8777-777777777777",
  ingredientId: gradde,
  storeId: store.id,
  productName: "Arla Matlagningsgrädde 15 %",
  packageSize: "5 dl",
  url: null,
  updatedAt: "2026-10-26T11:23:47.123456+00:00",
};
const stugan = { id: "88888888-8888-4888-8888-888888888888", name: "Stugan", siteCount: 2 };
/** What the list gets beside it when the store has no choices: the store, and the place it is counted against. */
const withStore = {
  store,
  storeUnavailable: false,
  productChoices: {},
  productChoicesUnavailable: false,
  unreadableChoices: [],
  site: stugan,
};
const listed = (choices: Record<string, unknown> = {}, unreadable: string[] = []) => ({ choices, unreadable });

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user" }));
  getCurrentPlan.mockReset().mockResolvedValue(plan);
  getRecipesByIds.mockReset().mockResolvedValue([recipe]);
  getPantrySnapshot.mockReset().mockResolvedValue(toSnapshot([{ ingredientId: gradde, amount: 1, unit: "dl" }]));
  getSelectedSite.mockReset().mockResolvedValue(stugan);
  getIngredientNames.mockReset().mockResolvedValue({ [gradde]: "Grädde" });
  getIngredientDefaults.mockReset().mockResolvedValue({ [gradde]: { section: "Mejeri", location: "Kyl", defaultUnit: "dl" } });
  listChecksIn.mockReset().mockResolvedValue([]);
  findPantryAdditions.mockReset().mockResolvedValue([]);
  listCustomItemsIn.mockReset().mockResolvedValue([]);
  listOverridesIn.mockReset().mockResolvedValue([]);
  getSelectedStore.mockReset().mockResolvedValue(store);
  listProductChoicesIn.mockReset().mockResolvedValue(listed());
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getShoppingList", () => {
  it("counts the list from the plan, its recipes, the pantry and the catalog", async () => {
    const result = await getShoppingList();
    expect(result).toEqual(
      ok({
        plan: {
          id: "plan",
          name: "Vecka 44",
          // The dish whose recipe is deleted is not counted.
          dishCount: 1,
          skippedCount: 1,
          dishTitles: { d1: "Krämig kycklinggryta", d2: "Borttaget" },
        },
        lines: [
          expect.objectContaining({ key: `r:${gradde}:dl`, label: "Grädde", amount: 2, unit: "dl", section: "Mejeri", origins: ["d1"] }),
        ],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        ...withStore,
      }),
    );
    expect(getRecipesByIds).toHaveBeenCalledWith([recipeId]);
    expect(getIngredientNames).toHaveBeenCalledWith([gradde]);
    // The pantry of exactly the place the list names (AD-24), read once.
    expect(getPantrySnapshot).toHaveBeenCalledTimes(1);
    expect(getPantrySnapshot).toHaveBeenCalledWith(stugan.id);
  });

  it("gives the list with nothing taken off and site null, logged, when the place cannot be read", async () => {
    getSelectedSite.mockRejectedValue(new PantryDataError("sites_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.site).toBeNull();
    expect(result.ok && result.data.pantryUnavailable).toBe(true);
    expect(result.ok && result.data.lines.map((line) => line.amount)).toEqual([3]);
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "sites_failed 08006" });
  });

  it("throws what the place's read does not expect", async () => {
    getSelectedSite.mockRejectedValue(new TypeError("bug"));
    await expect(getShoppingList()).rejects.toThrow("bug");
  });

  it("marks the plan's checked lines, read with the session client", async () => {
    listChecksIn.mockResolvedValue([`r:${gradde}:dl`, "r:00000000-0000-4000-8000-000000000000:st"]);
    const result = await getShoppingList();
    expect(listChecksIn).toHaveBeenCalledWith(db, "plan");
    expect(result.ok && result.data.lines.map((line) => [line.key, line.checked])).toEqual([[`r:${gradde}:dl`, true]]);
  });

  it("gives no plan and no lines without a current plan or own items, and reads no recipes", async () => {
    getCurrentPlan.mockResolvedValue(null);
    expect(await getShoppingList()).toEqual(
      ok({
        plan: null,
        lines: [],
        hiddenLines: [],
        pantryUnavailable: false,
        checksUnavailable: false,
        pendingClear: 0,
        ...withStore,
      }),
    );
    expect(getRecipesByIds).not.toHaveBeenCalled();
    expect(listOverridesIn).not.toHaveBeenCalled();
  });

  it("shows the own items, and their checks, in a week without a plan (Story 17.10)", async () => {
    const disk = "55000000-5555-4555-8555-555555555555";
    getCurrentPlan.mockResolvedValue(null);
    listCustomItemsIn.mockResolvedValue([{ id: disk, label: "diskmedel", ingredientId: null, amount: null, unit: null }]);
    listChecksIn.mockResolvedValue([`c:${disk}`]);
    const result = await getShoppingList();
    expect(listChecksIn).toHaveBeenCalledWith(db, null);
    expect(getRecipesByIds).not.toHaveBeenCalled();
    expect(listOverridesIn).not.toHaveBeenCalled();
    expect(result.ok && result.data.plan).toBeNull();
    expect(result.ok && result.data.lines.map((line) => [line.key, line.label, line.checked])).toEqual([
      [`c:${disk}`, "diskmedel", true],
    ]);
  });

  it("reads own items for the shown week, so a coming week leaves out what was checked before it", async () => {
    getPlanForWeek.mockResolvedValue(null);
    await getShoppingList("2999-01-04");
    expect(listCustomItemsIn).toHaveBeenCalledWith(db, "2999-01-04");
  });

  it("counts nothing against the pantry for a plan whose dishes all lost their recipe", async () => {
    getCurrentPlan.mockResolvedValue({ ...plan, recipes: [plan.recipes[1]] });
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.plan).toMatchObject({ dishCount: 0, skippedCount: 1 });
    expect(result.ok && result.data.pantryUnavailable).toBe(false);
    // The checks are read for any plan (own items need no dish, Story 3.5).
    expect(listChecksIn).toHaveBeenCalledWith(db, "plan");
  });

  it("shows the list without checks, and says so, when the checks cannot be read", async () => {
    listChecksIn.mockRejectedValue(new ShoppingDataError("list_checks_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.checksUnavailable).toBe(true);
    expect(result.ok && result.data.lines.map((line) => [line.label, line.checked])).toEqual([["Grädde", false]]);
    expect(log).toHaveBeenCalledWith("shopping_checks_unavailable", { reason: "list_checks_failed 08006" });
  });

  it("adds the plan's own items, each under its ingredient's section or Övrigt, also without dishes", async () => {
    const kaffe = "33333333-3333-4333-8333-333333333333";
    const own = "44444444-4444-4444-8444-444444444444";
    const disk = "55555555-5555-4555-8555-555555555555";
    listCustomItemsIn.mockResolvedValue([
      { id: own, label: "Kaffe", ingredientId: kaffe, amount: null, unit: null },
      { id: disk, label: "diskmedel", ingredientId: null, amount: 2, unit: "förp" },
    ]);
    getIngredientDefaults.mockImplementation(async (ids: string[]) =>
      Object.fromEntries(ids.map((id) => [id, { section: id === kaffe ? "Skafferi" : "Mejeri" }])),
    );
    listChecksIn.mockResolvedValue([`c:${disk}`]);
    const result = await getShoppingList();
    // All the user's own items, whichever week; the week decides only which checked ones are left out (Story 17.10).
    expect(listCustomItemsIn).toHaveBeenCalledWith(db, currentWeekStart());
    // The own item's ingredient gives its section, and its name for the detail; the line's name is Pontus's text.
    expect(getIngredientDefaults).toHaveBeenCalledWith([gradde, kaffe]);
    expect(getIngredientNames).toHaveBeenCalledWith([gradde, kaffe]);
    expect(result.ok && result.data.lines.map((line) => [line.section, line.key, line.label, line.checked])).toEqual([
      ["Mejeri", `r:${gradde}:dl`, "Grädde", false],
      ["Skafferi", `c:${own}`, "Kaffe", false],
      ["Övrigt", `c:${disk}`, "diskmedel", true],
    ]);

    getCurrentPlan.mockResolvedValue({ ...plan, recipes: [] });
    getIngredientNames.mockClear();
    const only = await getShoppingList();
    expect(only.ok && only.data.lines.map((line) => line.label)).toEqual(["Kaffe", "diskmedel"]);
    expect(getIngredientNames).toHaveBeenCalledWith([kaffe]);

    listCustomItemsIn.mockResolvedValue([]);
    getIngredientNames.mockClear();
    getIngredientDefaults.mockClear();
    expect(await getShoppingList()).toEqual(ok(expect.objectContaining({ lines: [] })));
    expect(getIngredientNames).not.toHaveBeenCalled();
    expect(getIngredientDefaults).not.toHaveBeenCalled();
  });

  it("applies the plan's corrected amounts and hidden lines, read with the session client", async () => {
    listOverridesIn.mockResolvedValue([{ key: `r:${gradde}:dl`, amount: 1.5, baseAmount: 2, hidden: false }]);
    const result = await getShoppingList();
    expect(listOverridesIn).toHaveBeenCalledWith(db, "plan");
    expect(result.ok && result.data.lines).toEqual([
      expect.objectContaining({ key: `r:${gradde}:dl`, amount: 1.5, computedAmount: 2 }),
    ]);

    listOverridesIn.mockResolvedValue([{ key: `r:${gradde}:dl`, amount: 1.5, baseAmount: 2, hidden: true }]);
    const hidden = await getShoppingList();
    expect(hidden.ok && hidden.data.lines).toEqual([]);
    // Dolda varor: the hidden line as counted without being hidden, with its correction.
    expect(hidden.ok && hidden.data.hiddenLines).toEqual([
      expect.objectContaining({ key: `r:${gradde}:dl`, label: "Grädde", amount: 1.5, computedAmount: 2 }),
    ]);
  });

  it("takes nothing off when the pantry cannot be read, and says so", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.pantryUnavailable).toBe(true);
    expect(result.ok && result.data.lines.map((line) => line.amount)).toEqual([3]);
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
  });

  it.each([
    ["the plan", () => getCurrentPlan.mockRejectedValue(new MealPlanDataError("query_failed 08006")), { reason: "query_failed 08006" }],
    ["the recipes", () => getRecipesByIds.mockRejectedValue(new RecipeDataError("query_failed 08006")), { reason: "query_failed 08006" }],
    [
      "the own items",
      () => listCustomItemsIn.mockRejectedValue(new ShoppingDataError("list_custom_items_failed 08006")),
      { reason: "list_custom_items_failed 08006" },
    ],
    [
      "the overrides",
      () => listOverridesIn.mockRejectedValue(new ShoppingDataError("list_overrides_failed 08006")),
      { reason: "list_overrides_failed 08006" },
    ],
    [
      "the catalog",
      () => getIngredientDefaults.mockRejectedValue(new CatalogDataError("query_failed", "08006")),
      { reason: "query_failed", detail: "08006" },
    ],
  ])("gives shopping_unavailable when %s cannot be read", async (_, failing, logged) => {
    failing();
    expect(await getShoppingList()).toEqual(fail("shopping_unavailable"));
    expect(log).toHaveBeenCalledWith("shopping_unavailable", logged);
  });

  it("counts the checks of lines no longer listed that an interrupted Lägg till i Matvaror put in the pantry", async () => {
    // The first check's line is listed; the other two are not (covered by the pantry, say).
    listChecksIn.mockResolvedValue([`r:${gradde}:dl`, `r:${gradde}:st`, "r:00000000-0000-4000-8000-000000000000:st"]);
    findPantryAdditions.mockResolvedValue(["check-2"]);
    const result = await getShoppingList();
    expect(result.ok && result.data.pendingClear).toBe(1);
    expect(findPantryAdditions).toHaveBeenCalledWith(["check-1", "check-2"]);
  });

  it("asks the pantry nothing when every check's line is listed, and gives 0 when the receipts cannot be read", async () => {
    listChecksIn.mockResolvedValue([`r:${gradde}:dl`]);
    expect((await getShoppingList()).ok).toBe(true);
    expect(findPantryAdditions).not.toHaveBeenCalled();
    listChecksIn.mockResolvedValue([`r:${gradde}:st`]);
    findPantryAdditions.mockRejectedValue(new PantryDataError("find_additions_failed 08006"));
    const result = await getShoppingList();
    expect(result.ok && result.data.pendingClear).toBe(0);
    expect(log).toHaveBeenCalledWith("shopping_pending_clear_unavailable", { reason: "find_additions_failed 08006" });
  });

  it("throws other errors, which are bugs", async () => {
    getRecipesByIds.mockRejectedValue(new TypeError("bug"));
    await expect(getShoppingList()).rejects.toThrow("bug");
  });

  it("reads nothing without a signed-in user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await getShoppingList()).toEqual(fail("unauthorized"));
    expect(getCurrentPlan).not.toHaveBeenCalled();
  });
});

describe("getShoppingList: the store and its product choices (Story 7.2)", () => {
  it("gives the selected store and its choices by ingredient beside the list, read with the session client", async () => {
    listProductChoicesIn.mockResolvedValue(listed({ [gradde]: choice }, ["88888888-8888-4888-8888-888888888888"]));
    const result = await getShoppingList();
    expect(listProductChoicesIn).toHaveBeenCalledWith(db, store.id);
    expect(result).toEqual(
      ok(
        expect.objectContaining({
          store,
          storeUnavailable: false,
          productChoices: { [gradde]: choice },
          productChoicesUnavailable: false,
          unreadableChoices: ["88888888-8888-4888-8888-888888888888"],
        }),
      ),
    );
    // Never in the list's lines.
    expect(result.ok && result.data.lines[0]).not.toHaveProperty("productChoice");
  });

  it("reads the store alongside the list, not after it", async () => {
    let releasePlan: () => void = () => {};
    getCurrentPlan.mockReturnValue(new Promise((resolve) => (releasePlan = () => resolve(plan))));
    const result = getShoppingList();
    await vi.waitFor(() => expect(getSelectedStore).toHaveBeenCalled());
    await vi.waitFor(() => expect(listProductChoicesIn).toHaveBeenCalled());
    releasePlan();
    expect((await result).ok).toBe(true);
  });

  it("gives no store and no choices when none is selected", async () => {
    getSelectedStore.mockResolvedValue(null);
    const result = await getShoppingList();
    expect(result).toEqual(
      ok(expect.objectContaining({ store: null, storeUnavailable: false, productChoices: {}, productChoicesUnavailable: false })),
    );
    expect(listProductChoicesIn).not.toHaveBeenCalled();
  });

  it("gives the list, with storeUnavailable, when the store cannot be read", async () => {
    getSelectedStore.mockRejectedValue(new SettingsDataError("query_failed 08006"));
    const result = await getShoppingList();
    expect(result).toEqual(
      ok(expect.objectContaining({ store: null, storeUnavailable: true, productChoices: {}, productChoicesUnavailable: false })),
    );
    expect(result.ok && result.data.lines).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("settings_store_unavailable", { reason: "query_failed 08006" });
    expect(listProductChoicesIn).not.toHaveBeenCalled();
  });

  it("gives the list, with productChoicesUnavailable, when the choices cannot be read", async () => {
    listProductChoicesIn.mockRejectedValue(new ShoppingDataError("list_product_choices_failed 08006"));
    const result = await getShoppingList();
    expect(result).toEqual(
      ok(expect.objectContaining({ store, storeUnavailable: false, productChoices: {}, productChoicesUnavailable: true })),
    );
    expect(result.ok && result.data.lines).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("shopping_product_choices_unavailable", { reason: "list_product_choices_failed 08006" });
  });

  it("still gives shopping_unavailable when the list itself cannot be read", async () => {
    getCurrentPlan.mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    expect(await getShoppingList()).toEqual(fail("shopping_unavailable"));
  });

  it("throws other errors from the store, which are bugs", async () => {
    getSelectedStore.mockRejectedValue(new TypeError("bug"));
    await expect(getShoppingList()).rejects.toThrow("bug");
    getSelectedStore.mockResolvedValue(store);
    listProductChoicesIn.mockRejectedValue(new TypeError("bug in choices"));
    await expect(getShoppingList()).rejects.toThrow("bug in choices");
  });

  it("throws a bug from the store even when the list itself could not be read, and waits for both", async () => {
    getCurrentPlan.mockRejectedValue(new MealPlanDataError("query_failed 08006"));
    getSelectedStore.mockRejectedValue(new TypeError("bug in store"));
    await expect(getShoppingList()).rejects.toThrow("bug in store");

    // A list that fails while the store is still being read: the store's read settles first.
    let releaseStore: (value: unknown) => void = () => {};
    getSelectedStore.mockReturnValue(new Promise((resolve) => (releaseStore = resolve)));
    const result = getShoppingList();
    let settled = false;
    void result.then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    releaseStore(store);
    expect(await result).toEqual(fail("shopping_unavailable"));
  });

  it("reads no store without a signed-in user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    await getShoppingList();
    expect(getSelectedStore).not.toHaveBeenCalled();
  });
});
