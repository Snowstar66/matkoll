import { describe, expect, it, vi } from "vitest";
import { PantryDataError, type PantryDb } from "./client";
import { deleteSiteIn, loadSiteItemCountsIn, saveSiteIn, selectSiteIn } from "./sites";

// The places' data layer (Story 8.2) with a client whose rpc answers with
// what the test gives: how each Postgres answer becomes an outcome.
// tests/integration/pantry-site.test.ts runs the same against the database.

type Answer = { data: unknown; error: { code: string; message?: string } | null };

function fakeRpc(answer: Answer) {
  const rpc = vi.fn(async () => answer);
  return { db: { rpc } as unknown as PantryDb, rpc };
}

const id = "11111111-1111-4111-8111-111111111111";
const row = { id, name: "Stugan", is_selected: false };
const form = { id, name: "Stugan", normalizedName: "stugan", mode: "add" as const };

describe("deleteSiteIn", () => {
  it.each([
    ["MK423", "selected, with items or the last"],
    ["23503", "items that came by a direct write"],
  ])("gives in_use for %s (%s)", async (code) => {
    const { db, rpc } = fakeRpc({ data: null, error: { code } });
    expect(await deleteSiteIn(db, id)).toEqual({ kind: "in_use" });
    expect(rpc).toHaveBeenCalledWith("delete_pantry_site", { site_id: id });
  });

  it("gives deleted, with whether a place went", async () => {
    expect(await deleteSiteIn(fakeRpc({ data: true, error: null }).db, id)).toEqual({ kind: "deleted", removed: true });
    expect(await deleteSiteIn(fakeRpc({ data: false, error: null }).db, id)).toEqual({ kind: "deleted", removed: false });
  });

  it("throws a PantryDataError with only the code otherwise", async () => {
    await expect(deleteSiteIn(fakeRpc({ data: null, error: { code: "08006" } }).db, id)).rejects.toThrow(
      new PantryDataError("failed 08006"),
    );
  });
});

describe("saveSiteIn and selectSiteIn", () => {
  it.each([
    ["MK410", { kind: "gone" }],
    ["MK422", { kind: "limit" }],
    ["MK424", { kind: "stale" }],
  ])("gives %s as %j", async (code, outcome) => {
    expect(await saveSiteIn(fakeRpc({ data: null, error: { code } }).db, form)).toEqual(outcome);
  });

  it("gives the saved place, and MK410 as gone for a selection", async () => {
    expect(await saveSiteIn(fakeRpc({ data: row, error: null }).db, form)).toEqual({
      kind: "saved",
      site: { id, name: "Stugan", isSelected: false },
    });
    expect(await selectSiteIn(fakeRpc({ data: null, error: { code: "MK410" } }).db, id)).toEqual({ kind: "gone" });
  });
});

describe("loadSiteItemCountsIn", () => {
  it("reads the grouped counts by place", async () => {
    const { db, rpc } = fakeRpc({ data: [{ site_id: id, item_count: 3 }], error: null });
    expect(await loadSiteItemCountsIn(db)).toEqual({ [id]: 3 });
    expect(rpc).toHaveBeenCalledWith("pantry_site_item_counts");
  });

  it("throws for a failed query or a row it cannot read", async () => {
    await expect(loadSiteItemCountsIn(fakeRpc({ data: null, error: { code: "57014" } }).db)).rejects.toThrow(
      new PantryDataError("query_failed 57014"),
    );
    await expect(loadSiteItemCountsIn(fakeRpc({ data: [{ site_id: id, item_count: "x" }], error: null }).db)).rejects.toThrow(
      new PantryDataError("invalid_row"),
    );
  });
});
