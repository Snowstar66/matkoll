import { beforeEach, describe, expect, it, vi } from "vitest";

// listStores and getSelectedStore read the stores once (React cache, per request in the app): the selected store is
// found among them, not asked for with a query of its own.

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", NODE_ENV: "test", AI_SETTINGS_EMAILS: [] } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const loadStores = vi.fn();
const loadSelectedStore = vi.fn();
vi.mock("./data/queries", async (original) => ({
  ...(await original<typeof import("./data/queries")>()),
  loadStores: (...args: unknown[]) => loadStores(...args),
  loadSelectedStore: (...args: unknown[]) => loadSelectedStore(...args),
}));

const store = (id: string, name: string, isSelected: boolean) => ({
  id,
  name,
  chain: "ica",
  externalStoreId: null,
  address: null,
  url: null,
  offersUrl: null,
  isSelected,
});

const { getSelectedStore, listStores } = await import("./server");

beforeEach(() => {
  loadStores.mockReset();
  loadSelectedStore.mockReset();
});

describe("the stores of a request", () => {
  it("finds the selected store among the stores, with no query of its own", async () => {
    loadStores.mockResolvedValue([store("a", "Coop", false), store("b", "ICA", true)]);
    expect((await getSelectedStore())?.id).toBe("b");
    expect(loadSelectedStore).not.toHaveBeenCalled();
  });

  it("has no selected store when none is selected", async () => {
    loadStores.mockResolvedValue([store("a", "Coop", false)]);
    expect(await getSelectedStore()).toBeNull();
  });

  it("lists the selected one first and the others by name", async () => {
    loadStores.mockResolvedValue([store("c", "Willys", false), store("a", "Coop", false), store("b", "ICA", true)]);
    expect((await listStores()).map((entry) => entry.id)).toEqual(["b", "a", "c"]);
  });
});
