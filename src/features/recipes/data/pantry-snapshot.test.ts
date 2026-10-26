import { beforeEach, describe, expect, it, vi } from "vitest";

class PantryDataError extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}
const getPantrySnapshot = vi.fn();
const getSelectedSite = vi.fn();
vi.mock("@/features/pantry/server", () => ({
  PantryDataError,
  getPantrySnapshot: (...args: unknown[]) => getPantrySnapshot(...args),
  getSelectedSite: () => getSelectedSite(),
}));

const { pantryForStatus, pantrySnapshotOrNull, selectedSiteOrNull } = await import("./pantry-snapshot");

const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };

beforeEach(() => {
  getPantrySnapshot.mockReset();
  getSelectedSite.mockReset().mockResolvedValue(stugan);
});

describe("pantrySnapshotOrNull", () => {
  it("gives the snapshot of the selected place, asked for without a place", async () => {
    const snapshot = new Map([["salt", { unlimited: true, amounts: [] }]]);
    getPantrySnapshot.mockResolvedValue(snapshot);
    expect(await pantrySnapshotOrNull()).toBe(snapshot);
    expect(getPantrySnapshot).toHaveBeenCalledWith();
  });

  it("gives null and logs pantry_unavailable with only the reason when the pantry cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    expect(await pantrySnapshotOrNull()).toBeNull();
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "query_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    getPantrySnapshot.mockRejectedValue(new TypeError("boom"));
    await expect(pantrySnapshotOrNull()).rejects.toThrow("boom");
  });
});

describe("selectedSiteOrNull", () => {
  it("gives the selected place, or null without one", async () => {
    expect(await selectedSiteOrNull()).toBe(stugan);
    getSelectedSite.mockResolvedValue(null);
    expect(await selectedSiteOrNull()).toBeNull();
  });

  it("gives null and logs pantry_unavailable with only the reason when the place cannot be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getSelectedSite.mockRejectedValue(new PantryDataError("sites_failed 08006"));
    expect(await selectedSiteOrNull()).toBeNull();
    expect(log).toHaveBeenCalledWith("pantry_unavailable", { reason: "sites_failed 08006" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    getSelectedSite.mockRejectedValue(new TypeError("boom"));
    await expect(selectedSiteOrNull()).rejects.toThrow("boom");
  });
});

describe("pantryForStatus", () => {
  it("gives the snapshot and the place it is of", async () => {
    const snapshot = new Map();
    getPantrySnapshot.mockResolvedValue(snapshot);
    expect(await pantryForStatus()).toEqual({ snapshot, site: stugan });
  });

  it("gives no place without a status, so the line never shows alone", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 08006"));
    expect(await pantryForStatus()).toEqual({ snapshot: null, site: null });
    log.mockRestore();
  });
});
