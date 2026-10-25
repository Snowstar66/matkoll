import { describe, expect, it } from "vitest";
import { parseAllowedEmails, planUserSync } from "../../scripts/users-sync-plan.mjs";

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
