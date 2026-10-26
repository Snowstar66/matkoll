import { beforeEach, describe, expect, it, vi } from "vitest";
import { PantryDataError } from "./data/client";

// listPantrySitesWithCounts (Story 8.2) with the data layer stubbed: the
// counts are a help, so failing to read them never hides the places.

vi.mock("@/features/auth/server", () => ({ requireUser: vi.fn() }));
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError: class extends Error {},
  getIngredientNames: vi.fn(),
  getIngredientDefaults: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ session: true }) }));
const loadPantrySitesIn = vi.fn();
const loadSiteItemCountsIn = vi.fn();
vi.mock("./data/sites", () => ({
  loadPantrySitesIn: () => loadPantrySitesIn(),
  loadSiteItemCountsIn: () => loadSiteItemCountsIn(),
}));

const { listPantrySitesWithCounts } = await import("./server");

const hemma = { id: "11111111-1111-4111-8111-111111111111", name: "Hemma", isSelected: true };
const stugan = { id: "22222222-2222-4222-8222-222222222222", name: "Stugan", isSelected: false };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  loadPantrySitesIn.mockReset().mockResolvedValue([hemma, stugan]);
  loadSiteItemCountsIn.mockReset().mockResolvedValue({ [hemma.id]: 12 });
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("listPantrySitesWithCounts", () => {
  it("gives each place its count, 0 for a place without items", async () => {
    expect(await listPantrySitesWithCounts()).toEqual([
      { ...hemma, itemCount: 12 },
      { ...stugan, itemCount: 0 },
    ]);
  });

  it("gives the places without counts when the counts cannot be read, and logs only the reason", async () => {
    loadSiteItemCountsIn.mockRejectedValue(new PantryDataError("query_failed 57014"));
    expect(await listPantrySitesWithCounts()).toEqual([
      { ...hemma, itemCount: null },
      { ...stugan, itemCount: null },
    ]);
    expect(log).toHaveBeenCalledWith("pantry_site_counts_unavailable", { reason: "query_failed 57014" });
  });

  it("throws when the places themselves cannot be read", async () => {
    loadPantrySitesIn.mockRejectedValue(new PantryDataError("query_failed 08006"));
    await expect(listPantrySitesWithCounts()).rejects.toThrow(new PantryDataError("query_failed 08006"));
  });
});
