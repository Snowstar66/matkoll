import { beforeEach, describe, expect, it, vi } from "vitest";

// The Inbjudningar actions (Story 21.1) with the database stubbed: the address is checked, an
// address on ALLOWED_EMAILS needs no invitation, the database's refusals become messages, and
// nothing is logged with an address or a code.

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({
  requireUser: async () => ({ ok: true, data: { id: "11111111-1111-4111-8111-111111111111", email: "pontus@example.com" } }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("@/server/env", () => ({ env: { ALLOWED_EMAILS: ["pontus@example.com"] } }));
const createAppInviteIn = vi.fn();
const removeAppInviteIn = vi.fn();
vi.mock("../data/app-invites", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../data/app-invites")>()),
  createAppInviteIn: (...args: unknown[]) => createAppInviteIn(...args),
  removeAppInviteIn: (...args: unknown[]) => removeAppInviteIn(...args),
}));

const { inviteByEmail, removeInvite } = await import("./app-invites");
const { AppInviteRefusal, AppInviteDataError } = await import("../data/app-invites");

const id = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  createAppInviteIn.mockReset().mockResolvedValue({ id, code: "K7Q4MP2X", expiresAt: "2026-11-14T10:00:00Z" });
  removeAppInviteIn.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("inviteByEmail", () => {
  it("sends the address in lower case and gives the code back", async () => {
    const result = await inviteByEmail({ email: "  Anna@Example.SE " });
    expect(result).toEqual({ ok: true, data: { id, code: "K7Q4MP2X", expiresAt: "2026-11-14T10:00:00Z" } });
    expect(createAppInviteIn).toHaveBeenCalledWith({}, "anna@example.se");
  });

  it("refuses what is not an address without asking the database", async () => {
    for (const email of ["", "anna", "a@b.se, c@d.se"]) {
      const result = await inviteByEmail({ email });
      expect(result.ok, email).toBe(false);
    }
    expect(createAppInviteIn).not.toHaveBeenCalled();
  });

  it("says an address on ALLOWED_EMAILS has access already", async () => {
    const result = await inviteByEmail({ email: "Pontus@example.com" });
    expect(result).toMatchObject({ ok: false, error: { code: "app_invite_in_env" } });
    expect(createAppInviteIn).not.toHaveBeenCalled();
  });

  it("turns the database's refusals into messages", async () => {
    createAppInviteIn.mockRejectedValueOnce(new AppInviteRefusal("42501"));
    expect(await inviteByEmail({ email: "anna@example.se" })).toMatchObject({ ok: false, error: { code: "app_invite_not_owner" } });
    createAppInviteIn.mockRejectedValueOnce(new AppInviteRefusal("MK461"));
    expect(await inviteByEmail({ email: "anna@example.se" })).toMatchObject({ ok: false, error: { code: "app_invite_already" } });
    createAppInviteIn.mockRejectedValueOnce(new AppInviteDataError("create_app_invite_failed 500"));
    expect(await inviteByEmail({ email: "anna@example.se" })).toMatchObject({ ok: false, error: { code: "app_invite_failed" } });
  });

  it("logs only the reason, never the address or the code", async () => {
    createAppInviteIn.mockRejectedValueOnce(new AppInviteDataError("create_app_invite_failed 500"));
    await inviteByEmail({ email: "anna@example.se" });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("500");
    expect(logged).not.toContain("anna@example.se");
  });
});

describe("removeInvite", () => {
  it("removes by id, and refuses an id that is not one", async () => {
    expect(await removeInvite({ inviteId: id })).toEqual({ ok: true, data: true });
    expect(removeAppInviteIn).toHaveBeenCalledWith({}, id);
    expect((await removeInvite({ inviteId: "not-an-id" })).ok).toBe(false);
    expect(removeAppInviteIn).toHaveBeenCalledTimes(1);
  });

  it("is refused for anyone but the owner", async () => {
    removeAppInviteIn.mockRejectedValueOnce(new AppInviteRefusal("42501"));
    expect(await removeInvite({ inviteId: id })).toMatchObject({ ok: false, error: { code: "app_invite_not_owner" } });
  });
});
