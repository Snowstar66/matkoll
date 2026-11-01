import { beforeEach, describe, expect, it, vi } from "vitest";

// The Medlemmar actions (Story 21.2b) with the database stubbed: the input is checked, the files
// of the one who goes are removed first, and someone let in only through the household is signed
// out after leaving.

vi.mock("server-only", () => ({}));
const keepSession = vi.fn();
vi.mock("@/features/auth/server", () => ({
  requireUser: async () => ({ ok: true, data: { id: "11111111-1111-4111-8111-111111111111" } }),
  keepSessionOnlyWithAccess: () => keepSession(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT ${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
const calls: string[] = [];
const removeMemberIn = vi.fn(async () => void calls.push("remove"));
const leaveHouseholdIn = vi.fn(async () => void calls.push("leave"));
const removeLeftoverFilesIn = vi.fn(async (_db: unknown, who: string) => void calls.push(`files ${who}`));
vi.mock("../data/leftover-files", () => ({ removeLeftoverFilesIn: (db: unknown, who: string) => removeLeftoverFilesIn(db, who) }));
vi.mock("../data/household", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/household")>()),
  removeMemberIn: () => removeMemberIn(),
  leaveHouseholdIn: () => leaveHouseholdIn(),
  setMyNameIn: async (_db: unknown, name: string) => name,
  loadMembersIn: () => loadMembersIn(),
}));
const me = { userId: "11111111-1111-4111-8111-111111111111", role: "owner", isMe: true };
const loadMembersIn = vi.fn();

const { leaveHousehold, removeMember, setMyName } = await import("./members");
const { HouseholdRefusal } = await import("../data/household");
const martina = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  calls.length = 0;
  keepSession.mockReset().mockResolvedValue(true);
  redirect.mockClear();
  removeMemberIn.mockClear();
  loadMembersIn.mockReset().mockResolvedValue([me, { userId: martina, role: "member", isMe: false }]);
});

describe("the Medlemmar actions", () => {
  it("removes the member's files before the member", async () => {
    expect((await removeMember({ userId: martina })).ok).toBe(true);
    expect(calls).toEqual([`files ${martina}`, "remove"]);
  });

  it("removes no files when the removal or the leaving would be refused", async () => {
    loadMembersIn.mockResolvedValue([{ ...me, role: "member" }, { userId: martina, role: "owner", isMe: false }]);
    expect(await removeMember({ userId: martina })).toMatchObject({ ok: false, error: { code: "household_not_owner" } });
    loadMembersIn.mockResolvedValue([me]);
    expect(await leaveHousehold()).toMatchObject({ ok: false, error: { code: "household_alone" } });
    expect(calls).toEqual([]);
  });

  it("never removes oneself or a non-id, and says when only the owner may", async () => {
    expect((await removeMember({ userId: "11111111-1111-4111-8111-111111111111" })).ok).toBe(false);
    expect((await removeMember({ userId: "nej" })).ok).toBe(false);
    expect(removeMemberIn).not.toHaveBeenCalled();
    removeMemberIn.mockRejectedValueOnce(new HouseholdRefusal("MK454"));
    expect(await removeMember({ userId: martina })).toMatchObject({ ok: false, error: { code: "household_not_owner" } });
  });

  it("leaves after removing one's own files, and goes to the login page without access", async () => {
    await expect(leaveHousehold()).rejects.toThrow("NEXT_REDIRECT /installningar/medlemmar?lamnat=1");
    expect(calls).toEqual(["files 11111111-1111-4111-8111-111111111111", "leave"]);
    keepSession.mockResolvedValue(false);
    await expect(leaveHousehold()).rejects.toThrow("NEXT_REDIRECT /logga-in?fel=lamnat");
  });

  it("checks a name before saving it", async () => {
    expect(await setMyName({ name: "  Anna  " })).toEqual({ ok: true, data: { name: "Anna" } });
    expect(await setMyName({ name: " " })).toMatchObject({ ok: false, error: { fields: { name: "Skriv ditt namn." } } });
    expect(await setMyName({ name: "x".repeat(41) })).toMatchObject({ ok: false, error: { fields: { name: "Högst 40 tecken." } } });
  });
});
