import { beforeEach, describe, expect, it, vi } from "vitest";
import { newPerson } from "../domain/people";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { id: "db" };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const saveFoodProfileIn = vi.fn();
const removeFoodProfileIn = vi.fn();
const listFoodProfilesIn = vi.fn();
const importFoodProfilesIn = vi.fn();
vi.mock("../data/food-profile", () => ({
  FoodProfileDataError: class extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
  saveFoodProfileIn: (...args: unknown[]) => saveFoodProfileIn(...args),
  removeFoodProfileIn: (...args: unknown[]) => removeFoodProfileIn(...args),
  listFoodProfilesIn: (...args: unknown[]) => listFoodProfilesIn(...args),
  importFoodProfilesIn: (...args: unknown[]) => importFoodProfilesIn(...args),
}));

const { saveFoodProfile, removeFoodProfile, importLocalProfiles } = await import("./food-profile");
const { FoodProfileDataError } = await import("../data/food-profile");

const userId = "11111111-1111-4111-8111-111111111111";
const guest = { ...newPerson("p-g1", "Bo", "guest"), allergies: ["gluten" as const] };

beforeEach(() => {
  for (const mock of [requireUser, saveFoodProfileIn, removeFoodProfileIn, listFoodProfilesIn, importFoodProfilesIn]) mock.mockReset();
  requireUser.mockResolvedValue({ ok: true, data: { id: userId } });
  listFoodProfilesIn.mockResolvedValue([]);
});

describe("saveFoodProfile", () => {
  it("saves a person under their key with the session client, and Du under the member key", async () => {
    expect(await saveFoodProfile(guest)).toEqual({ ok: true, data: null });
    expect(saveFoodProfileIn).toHaveBeenCalledWith(db, expect.objectContaining({ personKey: "p-g1", kind: "guest", name: "Bo", allergies: ["gluten"] }));
    await saveFoodProfile({ ...newPerson("me", "Du", "member"), drink: "vin" });
    expect(saveFoodProfileIn).toHaveBeenLastCalledWith(db, expect.objectContaining({ personKey: `m-${userId}`, name: null, drink: "vin" }));
  });

  it("fails without a session, on a bad shape and when the database refuses", async () => {
    requireUser.mockResolvedValue({ ok: false, error: { code: "unauthorized" } });
    expect(await saveFoodProfile(guest)).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    requireUser.mockResolvedValue({ ok: true, data: { id: userId } });
    expect(await saveFoodProfile({ ...guest, drink: "mjölk" } as never)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(await saveFoodProfile({ ...guest, id: "bad id!" })).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(saveFoodProfileIn).not.toHaveBeenCalled();
    saveFoodProfileIn.mockRejectedValue(new FoodProfileDataError("save_failed 42501"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveFoodProfile(guest)).toMatchObject({ ok: false, error: { code: "food_profile_failed" } });
  });

  it("never logs a name or a preference when saving fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    saveFoodProfileIn.mockRejectedValue(new FoodProfileDataError("save_failed 23514"));
    await saveFoodProfile(guest);
    expect(JSON.stringify(error.mock.calls)).not.toContain("Bo");
    expect(JSON.stringify(error.mock.calls)).not.toContain("gluten");
  });
});

describe("removeFoodProfile", () => {
  it("removes by key, and refuses Du", async () => {
    expect(await removeFoodProfile("p-g1")).toEqual({ ok: true, data: null });
    expect(removeFoodProfileIn).toHaveBeenCalledWith(db, "p-g1");
    expect(await removeFoodProfile("me")).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(removeFoodProfileIn).toHaveBeenCalledTimes(1);
  });
});

describe("importLocalProfiles", () => {
  const mine = { ...newPerson("me", "Du", "member"), drink: "ol" as const };

  it("adds only the people the household has no row for and gives back what the household has", async () => {
    const stored = { personKey: "p-g1", kind: "guest", name: "Bo", allergies: [], tastes: {}, dislikes: [], likes: [], drink: null };
    listFoodProfilesIn.mockResolvedValueOnce([stored]).mockResolvedValueOnce([stored, { ...stored, personKey: `m-${userId}`, kind: "member", name: null, drink: "ol" }]);
    const result = await importLocalProfiles([mine, guest]);
    expect(importFoodProfilesIn).toHaveBeenCalledWith(db, [expect.objectContaining({ personKey: `m-${userId}`, drink: "ol" })]);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.data.map((person) => person.id)).toEqual(["p-g1", "me"]);
  });

  it("changes nothing when there is nothing to add", async () => {
    expect(await importLocalProfiles([])).toEqual({ ok: true, data: [] });
    expect(importFoodProfilesIn).toHaveBeenCalledWith(db, []);
  });

  it("fails on a bad shape and when the database refuses", async () => {
    expect(await importLocalProfiles([{ id: "" }] as never)).toMatchObject({ ok: false, error: { code: "validation" } });
    importFoodProfilesIn.mockRejectedValue(new FoodProfileDataError("import_failed 42501"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await importLocalProfiles([mine])).toMatchObject({ ok: false, error: { code: "food_profile_failed" } });
  });
});
