import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { SettingsDataError } from "../data/client";

// selectStore with the user check, the session client, the write and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const selectStoreIn = vi.fn();
vi.mock("../data/stores", () => ({ selectStoreIn: (...args: unknown[]) => selectStoreIn(...args) }));

const { selectStore } = await import("./select-store");

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  selectStoreIn.mockReset().mockResolvedValue("selected");
  revalidateFor.mockReset();
});

describe("selectStore", () => {
  it("selects the store and revalidates the store's routes", async () => {
    expect(await selectStore({ id })).toEqual(ok({ id }));
    expect(selectStoreIn).toHaveBeenCalledWith(db, id);
    expect(revalidateFor).toHaveBeenCalledWith("store");
  });

  it("returns unauthorized without an allowed user, and selects nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await selectStore({ id })).toEqual(fail("unauthorized"));
    expect(selectStoreIn).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one", async () => {
    expect(await selectStore({ id: "1003733" })).toEqual(fail("validation"));
    expect(selectStoreIn).not.toHaveBeenCalled();
  });

  it("says when the store is gone, and revalidates nothing", async () => {
    selectStoreIn.mockResolvedValue("gone");
    expect(await selectStore({ id })).toEqual(fail("settings_store_gone"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives settings_save_failed when the write fails, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    selectStoreIn.mockRejectedValue(new SettingsDataError("select_store 40P01"));
    expect(await selectStore({ id })).toEqual(fail("settings_save_failed"));
    expect(log).toHaveBeenCalledWith("settings_save_failed", { reason: "select_store 40P01" });
    log.mockRestore();
  });

  it("throws other errors, which are bugs", async () => {
    selectStoreIn.mockRejectedValue(new TypeError("boom"));
    await expect(selectStore({ id })).rejects.toThrow("boom");
  });
});
