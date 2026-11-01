import { describe, expect, it } from "vitest";
import { ownerFrom, parseOwnerEmail, planOwnerSync } from "../../scripts/owner-sync-plan.mjs";

// `pnpm owner:sync` (Story 20.3): OWNER_EMAIL becomes the only address in app_owner.

describe("parseOwnerEmail", () => {
  it("reads the address as the app does, and refuses a missing or broken one", () => {
    expect(parseOwnerEmail("  Pontus@Example.SE ")).toBe("pontus@example.se");
    expect(() => parseOwnerEmail(undefined)).toThrow(/empty/);
    expect(() => parseOwnerEmail("  ")).toThrow(/empty/);
    expect(() => parseOwnerEmail("pontus")).toThrow(/not a valid/);
  });
});

describe("planOwnerSync", () => {
  it("adds the owner when missing and removes every other address", () => {
    expect(planOwnerSync("a@x.se", [])).toEqual({ add: true, remove: [] });
    expect(planOwnerSync("a@x.se", ["a@x.se"])).toEqual({ add: false, remove: [] });
    expect(planOwnerSync("a@x.se", ["b@x.se", "a@x.se"])).toEqual({ add: false, remove: ["b@x.se"] });
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
