import { describe, expect, it, vi } from "vitest";
import { parseAllowedEmails, planUserSync, pruneUser } from "../../scripts/users-sync-plan.mjs";

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

describe("pruneUser (Story 10.3)", () => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "old@example.com" };

  it("removes the user's photo files first, then the user", async () => {
    const steps: string[] = [];
    const removePhotos = vi.fn(async () => (steps.push("photos"), 3));
    const deleteUser = vi.fn(async () => (steps.push("user"), { error: null }));
    expect(await pruneUser(user, { removePhotos, deleteUser })).toEqual({ ok: true, removedPhotos: 3 });
    expect(steps).toEqual(["photos", "user"]);
    expect(removePhotos).toHaveBeenCalledWith(user.id);
    expect(deleteUser).toHaveBeenCalledWith(user.id);
  });

  it("keeps the user when the files cannot be removed, and says why without a path", async () => {
    const deleteUser = vi.fn(async () => ({ error: null }));
    const removePhotos = vi.fn(async () => {
      throw Object.assign(new Error("remove failed (503)"), { code: "503" });
    });
    expect(await pruneUser(user, { removePhotos, deleteUser })).toEqual({ ok: false, step: "photos", code: "503" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("says when the user cannot be deleted after the files went", async () => {
    const result = await pruneUser(user, {
      removePhotos: async () => 0,
      deleteUser: async () => ({ error: { status: 500 } }),
    });
    expect(result).toEqual({ ok: false, step: "user", code: "500" });
  });
});
