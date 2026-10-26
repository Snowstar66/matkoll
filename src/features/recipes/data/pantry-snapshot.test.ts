import { beforeEach, describe, expect, it, vi } from "vitest";

class PantryDataError extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
}
const getPantrySnapshot = vi.fn();
vi.mock("@/features/pantry/server", () => ({ PantryDataError, getPantrySnapshot: () => getPantrySnapshot() }));

const { pantrySnapshotOrNull } = await import("./pantry-snapshot");

beforeEach(() => {
  getPantrySnapshot.mockReset();
});

describe("pantrySnapshotOrNull", () => {
  it("gives the snapshot", async () => {
    const snapshot = new Map([["salt", { unlimited: true, amounts: [] }]]);
    getPantrySnapshot.mockResolvedValue(snapshot);
    expect(await pantrySnapshotOrNull()).toBe(snapshot);
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
