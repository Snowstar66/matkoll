import { describe, expect, it, vi } from "vitest";
import {
  parseAllowedEmails,
  planUserSync,
  pruneBanDuration,
  pruneExtraUsers,
  removeDeletedUsersFiles,
} from "../../scripts/users-sync-plan.mjs";
import { memoryBucket } from "./memory-bucket";

describe("parseAllowedEmails", () => {
  it("trims, lower-cases, drops empty entries and duplicates", () => {
    expect(parseAllowedEmails(" A@example.com, b@example.com ,,a@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
  });

  it("returns an empty list when unset", () => {
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });

  it("rejects invalid addresses without echoing them", () => {
    expect(() => parseAllowedEmails("ok@example.com,secret-nobody")).toThrowError(
      expect.objectContaining({ message: expect.not.stringContaining("secret-nobody") }),
    );
  });
});

describe("planUserSync", () => {
  const existing = [
    { id: "1", email: "pontus@example.com" },
    { id: "2", email: "Old@Example.com" },
  ];

  it("creates only missing users and keeps existing ones", () => {
    const plan = planUserSync(["pontus@example.com", "new@example.com"], existing);
    expect(plan.create).toEqual(["new@example.com"]);
    expect(plan.keep).toEqual([existing[0]]);
  });

  it("reports users outside the list but deletes nothing without prune", () => {
    const plan = planUserSync(["pontus@example.com"], existing);
    expect(plan.extra).toEqual([existing[1]]);
    expect(plan.remove).toEqual([]);
  });

  it("deletes users outside the list with prune", () => {
    const plan = planUserSync(["pontus@example.com"], existing, { prune: true });
    expect(plan.remove).toEqual([existing[1]]);
  });

  it("is idempotent: a second run creates nothing", () => {
    const allowed = ["pontus@example.com", "new@example.com"];
    const first = planUserSync(allowed, existing);
    const afterFirst = [...existing, ...first.create.map((email, i) => ({ id: `n${i}`, email }))];
    expect(planUserSync(allowed, afterFirst).create).toEqual([]);
  });

  it("matches addresses without regard to case", () => {
    expect(planUserSync(["old@example.com"], existing).create).toEqual([]);
  });
});

/**
 * The service role's client as pruneExtraUsers and removeDeletedUsersFiles
 * use it, with a bucket in memory and every call recorded in `steps`.
 */
function fakeAdmin(paths: string[], existing: string[] = [], households: Record<string, string> = {}) {
  const steps: string[] = [];
  const memory = memoryBucket(paths);
  const users = new Set(existing);
  const bucket = {
    list: (...args: Parameters<typeof memory.list>) => memory.list(...args),
    remove: vi.fn(async (names: string[]) => {
      steps.push(`remove ${names.length}`);
      return memory.remove(names);
    }),
  };
  const auth = {
    admin: {
      updateUserById: vi.fn(async (id: string, attributes: { ban_duration: string }) => {
        steps.push(`ban ${id} ${attributes.ban_duration}`);
        return { error: null as unknown };
      }),
      deleteUser: vi.fn(async (id: string) => {
        steps.push(`delete ${id}`);
        users.delete(id);
        return { error: null as unknown };
      }),
      getUserById: vi.fn(async (id: string) =>
        users.has(id)
          ? { data: { user: { id } } as { user: unknown } | null, error: null as unknown }
          : { data: { user: null } as { user: unknown } | null, error: { status: 404, code: "user_not_found" } as unknown },
      ),
    },
  };
  const rowsDeleted = vi.fn(async (column: string, value: string) => {
    steps.push(`rows ${column}=${value}`);
    return { error: null as unknown };
  });
  // household_member (Story 21.2a): `households` maps a user to their household.
  const members = (column: string, value: string) =>
    Object.entries(households)
      .filter(([user, household]) => (column === "user_id" ? user === value : household === value))
      .map(([user, household]) => ({ user_id: user, household_id: household }));
  const from = vi.fn((table: string) => ({
    delete: () => ({ eq: (column: string, value: string) => (steps.push(`from ${table}`), rowsDeleted(column, value)) }),
    select: () => ({
      eq: (column: string, value: string) => {
        const data = members(column, value);
        return Object.assign(Promise.resolve({ data, error: null as unknown }), {
          maybeSingle: async () => ({ data: data[0] ?? null, error: null as unknown }),
        });
      },
    }),
  }));
  return { client: { auth, storage: { from: () => bucket }, from }, steps, files: memory.files, bucket, auth, rowsDeleted };
}

describe("pruneExtraUsers (Story 10.3)", () => {
  const old = "11111111-1111-4111-8111-111111111111";
  const older = "22222222-2222-4222-8222-222222222222";
  const filesOf = (id: string) => [`${id}/site/kyl/a.jpg`, `${id}/site/frys/b.png`, `${id}/other/skafferi/c.jpg`];
  const plan = (...ids: string[]) => ({ remove: ids.map((id) => ({ id, email: `${id}@example.com` })) });

  it("bans the user, removes its photo files, deletes it, then lists its folder once more", async () => {
    const admin = fakeAdmin([...filesOf(old), "33333333-3333-4333-8333-333333333333/s/kyl/x.jpg"], [old]);
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result).toEqual({ ok: true, lines: [{ level: "info", text: `deleted  ${old} and 3 photo file(s)` }] });
    expect(admin.steps).toEqual([`ban ${old} ${pruneBanDuration}`, "remove 3", `delete ${old}`]);
    expect([...admin.files]).toEqual(["33333333-3333-4333-8333-333333333333/s/kyl/x.jpg"]);
  });

  it("keeps the photo files of a user whose household has other members, and deletes only the user (Story 21.2a)", async () => {
    const admin = fakeAdmin(filesOf(old), [old], { [old]: "h1", [older]: "h1" });
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result).toEqual({ ok: true, lines: [{ level: "info", text: `deleted  ${old}; its photo files stay with its household` }] });
    expect(admin.steps).toEqual([`ban ${old} ${pruneBanDuration}`, `delete ${old}`]);
    expect(admin.files.size).toBe(3);
  });

  it("removes a file that came in after the files went, once the user is deleted", async () => {
    const admin = fakeAdmin(filesOf(old), [old]);
    admin.auth.admin.deleteUser.mockImplementationOnce(async (id: string) => {
      admin.steps.push(`delete ${id}`);
      admin.files.add(`${id}/site/kyl/late.jpg`);
      return { error: null };
    });
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result.lines).toEqual([{ level: "info", text: `deleted  ${old} and 4 photo file(s)` }]);
    expect(admin.steps).toEqual([`ban ${old} ${pruneBanDuration}`, "remove 3", `delete ${old}`, "remove 1"]);
    expect(admin.files.size).toBe(0);
  });

  it("keeps a user whose photos cannot be removed, goes on with the others, and fails the run", async () => {
    const admin = fakeAdmin([...filesOf(old), ...filesOf(older)], [old, older]);
    admin.bucket.remove.mockImplementationOnce(async () => ({ data: null, error: { status: 503 } }));
    const result = await pruneExtraUsers(plan(old, older), admin.client as never);
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      { level: "error", text: `could not remove the photos of ${old} (503); the user is kept, banned` },
      { level: "info", text: `deleted  ${older} and 3 photo file(s)` },
    ]);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledTimes(1);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(older);
  });

  it("never touches the photos of a user it could not ban", async () => {
    const admin = fakeAdmin(filesOf(old), [old]);
    admin.auth.admin.updateUserById.mockResolvedValueOnce({ error: { status: 500 } });
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result).toEqual({
      ok: false,
      lines: [{ level: "error", text: `could not prune ${old}: could not ban it (500); the user is kept` }],
    });
    expect(admin.files.size).toBe(3);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("deletes the photo rows when the user cannot be deleted after its files went, so no row points at a missing file", async () => {
    const admin = fakeAdmin(filesOf(old), [old]);
    admin.auth.admin.deleteUser.mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result.ok).toBe(false);
    expect(result.lines).toEqual([
      {
        level: "error",
        text: `could not delete ${old} (unexpected_failure); its 3 photo file(s) and their rows are removed; the user is kept, banned`,
      },
    ]);
    expect(admin.rowsDeleted).toHaveBeenCalledWith("user_id", old);
    expect(admin.client.from).toHaveBeenCalledWith("pantry_photo");
  });

  it("says so when those rows cannot be deleted either", async () => {
    const admin = fakeAdmin(filesOf(old), [old]);
    admin.auth.admin.deleteUser.mockResolvedValueOnce({ error: { status: 500 } });
    admin.rowsDeleted.mockResolvedValueOnce({ error: { code: "08006" } });
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    expect(result.lines[0].text).toBe(
      `could not delete ${old} (500); its 3 photo file(s) are removed, but its photo rows are not (08006); the user is kept, banned`,
    );
  });

  it("prints ids only, never an address or a path", async () => {
    const admin = fakeAdmin(filesOf(old), [old]);
    admin.bucket.remove.mockImplementationOnce(async () => ({ data: null, error: { status: 503, message: filesOf(old)[0] } }));
    const result = await pruneExtraUsers(plan(old), admin.client as never);
    const printed = JSON.stringify(result.lines);
    expect(printed).not.toContain("@example.com");
    expect(printed).not.toContain("/site/");
  });
});

describe("removeDeletedUsersFiles (Story 10.3)", () => {
  const here = "11111111-1111-4111-8111-111111111111";
  const deleted = "22222222-2222-4222-8222-222222222222";

  it("removes the files of a user deleted elsewhere, keeps the others', and says so by id", async () => {
    const admin = fakeAdmin([`${here}/s/kyl/a.jpg`, `${deleted}/s/kyl/b.jpg`, `${deleted}/t/frys/c.png`], [here]);
    expect(await removeDeletedUsersFiles(admin.client as never)).toEqual({
      ok: true,
      lines: [{ level: "info", text: `removed  2 photo file(s) of the deleted user ${deleted}` }],
    });
    expect([...admin.files]).toEqual([`${here}/s/kyl/a.jpg`]);
  });

  it("removes nothing when Supabase Auth cannot say the user is gone, and fails the run", async () => {
    const admin = fakeAdmin([`${deleted}/s/kyl/b.jpg`], []);
    admin.auth.admin.getUserById.mockResolvedValueOnce({ data: null, error: { status: 503 } });
    const result = await removeDeletedUsersFiles(admin.client as never);
    expect(result).toEqual({
      ok: false,
      lines: [{ level: "error", text: `could not remove the photos of the deleted user ${deleted} (user_503)` }],
    });
    expect(admin.files.size).toBe(1);
  });

  it("says nothing when every folder has its user", async () => {
    const admin = fakeAdmin([`${here}/s/kyl/a.jpg`], [here]);
    expect(await removeDeletedUsersFiles(admin.client as never)).toEqual({ ok: true, lines: [] });
  });
});
