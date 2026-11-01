import { describe, expect, it } from "vitest";
import { ownerFrom, ownerUserId, parseOwnerEmail, planOwnerSync } from "../../scripts/owner-sync-plan.mjs";

// `pnpm owner:sync` (Story 20.3): OWNER_EMAIL's user becomes the only user in app_owner, by id.

describe("parseOwnerEmail", () => {
  it("reads the address as the app does, and refuses a missing or broken one", () => {
    expect(parseOwnerEmail("  Pontus@Example.SE ")).toBe("pontus@example.se");
    expect(() => parseOwnerEmail(undefined)).toThrow(/empty/);
    expect(() => parseOwnerEmail("  ")).toThrow(/empty/);
    expect(() => parseOwnerEmail("pontus")).toThrow(/not a valid/);
  });
});

describe("planOwnerSync", () => {
  it("adds the owner's id when missing and removes every other id", () => {
    expect(planOwnerSync("u1", [])).toEqual({ add: true, remove: [] });
    expect(planOwnerSync("u1", ["u1"])).toEqual({ add: false, remove: [] });
    expect(planOwnerSync("u1", ["u2", "u1"])).toEqual({ add: false, remove: ["u2"] });
  });
});

describe("ownerUserId", () => {
  it("finds the user with the address, in any case, or nobody", () => {
    const users = [
      { id: "u1", email: "Pontus@X.se" },
      { id: "u2", email: null },
      { id: "u3", email: "anna@x.se" },
    ];
    expect(ownerUserId("pontus@x.se", users)).toBe("u1");
    expect(ownerUserId("erik@x.se", users)).toBeNull();
  });
});

describe("ownerFrom", () => {
  it("takes OWNER_EMAIL, and on local Supabase without it the auto-login user", () => {
    const local = "http://127.0.0.1:54321";
    expect(ownerFrom({ OWNER_EMAIL: "Owner@x.se", DEV_AUTO_LOGIN_EMAIL: "dev@x.se" }, local)).toEqual({ email: "owner@x.se", from: "OWNER_EMAIL" });
    expect(ownerFrom({ DEV_AUTO_LOGIN_EMAIL: "dev@x.se" }, local)).toEqual({ email: "dev@x.se", from: "DEV_AUTO_LOGIN_EMAIL" });
    expect(() => ownerFrom({ DEV_AUTO_LOGIN_EMAIL: "dev@x.se" }, "https://ref.supabase.co")).toThrow(/OWNER_EMAIL is empty/);
    expect(() => ownerFrom({}, local)).toThrow(/OWNER_EMAIL is empty/);
  });
});
