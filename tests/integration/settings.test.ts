import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActiveRecipeDomains } from "@/features/settings/data/queries";
import { insertUserDefaults } from "@/features/settings/data/defaults";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation } from "./support";

// The settings module against local Supabase (AD-4, AD-11, AD-21): RLS on
// recipe_site, the start data from ensure_user_defaults() and the domain rules
// in the table's check constraint.

let unique = 0;
const uniqueDomain = () => `test-${Date.now()}-${unique++}.example`;

async function sitesOf(userId: string) {
  const { data, error } = await adminClient()
    .from("recipe_site")
    .select("domain, is_active")
    .eq("user_id", userId)
    .order("domain");
  if (error) throw error;
  return data;
}

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates recipe_site", async () => {
    await expectRlsIsolation("recipe_site", async () => ({ domain: uniqueDomain() }));
  });

  it("keeps a domain once per user, and lets two users have the same one", async () => {
    const one = await createTestUser("site-one");
    const two = await createTestUser("site-two");
    const domain = uniqueDomain();
    expect((await one.db.from("recipe_site").insert({ domain })).error).toBeNull();
    expect((await one.db.from("recipe_site").insert({ domain })).error?.code).toBe("23505");
    expect((await two.db.from("recipe_site").insert({ domain })).error).toBeNull();
  });

  it("refuses domains that are not in the stored form", async () => {
    const user = await createTestUser("site-check");
    const longLabel = `${"a".repeat(64)}.se`;
    for (const domain of ["www.koket.se", "Koket.se", "https://koket.se", "koket.se/recept", "koket", "127.0.0.1", "koket..se", "", longLabel]) {
      expect((await user.db.from("recipe_site").insert({ domain })).error?.code, domain).toBe("23514");
    }
    expect(await sitesOf(user.id)).toEqual([]);
  });
});

describe("ensure_user_defaults()", () => {
  it("adds the start sites, active, and a second call changes nothing", async () => {
    const user = await createTestUser("defaults");
    expect(await sitesOf(user.id)).toEqual([]);

    expect((await user.db.rpc("ensure_user_defaults")).error).toBeNull();
    const first = await sitesOf(user.id);
    expect(first).toEqual([
      { domain: "arla.se", is_active: true },
      { domain: "ica.se", is_active: true },
      { domain: "koket.se", is_active: true },
      { domain: "tasteline.com", is_active: true },
    ]);

    expect((await user.db.rpc("ensure_user_defaults")).error).toBeNull();
    expect(await sitesOf(user.id)).toEqual(first);
  });

  it("leaves a site Pontus has turned off as it is", async () => {
    const user = await createTestUser("defaults-off");
    await insertUserDefaults(user.db);
    const off = await user.db.from("recipe_site").update({ is_active: false }).eq("domain", "koket.se");
    expect(off.error).toBeNull();
    await insertUserDefaults(user.db);
    expect(await sitesOf(user.id)).toEqual([
      { domain: "arla.se", is_active: true },
      { domain: "ica.se", is_active: true },
      { domain: "koket.se", is_active: false },
      { domain: "tasteline.com", is_active: true },
    ]);
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "tasteline.com"]);
  });

  it("adds a deleted site again, which is why sites are turned off and never deleted", async () => {
    const user = await createTestUser("defaults-deleted");
    await insertUserDefaults(user.db);
    expect((await user.db.from("recipe_site").delete().eq("domain", "ica.se")).error).toBeNull();
    await insertUserDefaults(user.db);
    expect((await sitesOf(user.id)).map((site) => site.domain)).toContain("ica.se");
  });

  it("accepts a label of 63 characters", async () => {
    const user = await createTestUser("defaults-label");
    expect((await user.db.from("recipe_site").insert({ domain: `${"a".repeat(63)}.se` })).error).toBeNull();
  });

  it("only touches the caller's rows", async () => {
    const user = await createTestUser("defaults-mine");
    const other = await createTestUser("defaults-other");
    await insertUserDefaults(user.db);
    expect(await sitesOf(other.id)).toEqual([]);
  });

  it("cannot be called without a session", async () => {
    expect((await anonClient().rpc("ensure_user_defaults")).error?.code).toBe("42501");
  });
});

describe("loadActiveRecipeDomains", () => {
  it("reads only the signed-in user's active sites", async () => {
    const user = await createTestUser("domains");
    const other = await createTestUser("domains-other");
    await insertUserDefaults(user.db);
    await insertUserDefaults(other.db);
    const extra = uniqueDomain();
    expect((await other.db.from("recipe_site").insert({ domain: extra })).error).toBeNull();
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "koket.se", "tasteline.com"]);
  });
});
