import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActiveRecipeDomains } from "@/features/settings/data/queries";
import { insertUserDefaults } from "@/features/settings/data/defaults";
import { SettingsDataError } from "@/features/settings/data/client";
import { addRecipeSiteIn, setRecipeSiteActiveIn } from "@/features/settings/data/sites";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation } from "./support";

// The settings module against local Supabase (AD-4, AD-11, AD-21): RLS on
// recipe_site, the start data from ensure_user_defaults(), the domain rules
// in the table's check constraint, and adding, turning off and turning on
// sites from Inställningar (Story 1.12).

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

describe("managing sites in Inställningar", () => {
  it("adds a new site, active", async () => {
    const user = await createTestUser("sites-add");
    await insertUserDefaults(user.db);
    const domain = uniqueDomain();
    expect(await addRecipeSiteIn(user.db, user.id, domain)).toBe("added");
    expect(await loadActiveRecipeDomains(user.db)).toContain(domain);
    expect(await sitesOf(user.id)).toContainEqual({ domain, is_active: true });
  });

  it("calls an active site a duplicate and changes nothing", async () => {
    const user = await createTestUser("sites-duplicate");
    await insertUserDefaults(user.db);
    const before = await sitesOf(user.id);
    expect(await addRecipeSiteIn(user.db, user.id, "koket.se")).toBe("duplicate");
    expect(await sitesOf(user.id)).toEqual(before);
  });

  it("refuses a domain the table's check refuses", async () => {
    const user = await createTestUser("sites-invalid");
    expect(await addRecipeSiteIn(user.db, user.id, "www.koket.se")).toBe("invalid");
    expect(await sitesOf(user.id)).toEqual([]);
  });

  it("turns a site off without deleting it, and it stays off after the next sign-in", async () => {
    const user = await createTestUser("sites-off");
    await insertUserDefaults(user.db);
    expect(await setRecipeSiteActiveIn(user.db, user.id, "koket.se", false)).toBe("changed");
    expect(await setRecipeSiteActiveIn(user.db, user.id, "koket.se", false)).toBe("unchanged");
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "tasteline.com"]);
    expect(await sitesOf(user.id)).toContainEqual({ domain: "koket.se", is_active: false });

    // A new sign-in runs ensure_user_defaults() again.
    await insertUserDefaults(user.db);
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "tasteline.com"]);
  });

  it("turns an off site on again, by Ångra or by adding it again", async () => {
    const user = await createTestUser("sites-on");
    await insertUserDefaults(user.db);
    await setRecipeSiteActiveIn(user.db, user.id, "koket.se", false);
    expect(await setRecipeSiteActiveIn(user.db, user.id, "koket.se", true)).toBe("changed");
    expect(await setRecipeSiteActiveIn(user.db, user.id, "koket.se", true)).toBe("unchanged");
    expect(await loadActiveRecipeDomains(user.db)).toContain("koket.se");

    await setRecipeSiteActiveIn(user.db, user.id, "arla.se", false);
    expect(await addRecipeSiteIn(user.db, user.id, "arla.se")).toBe("reactivated");
    expect(await sitesOf(user.id)).toEqual([
      { domain: "arla.se", is_active: true },
      { domain: "ica.se", is_active: true },
      { domain: "koket.se", is_active: true },
      { domain: "tasteline.com", is_active: true },
    ]);
  });

  it("reports a site the user does not have", async () => {
    const user = await createTestUser("sites-missing");
    expect(await setRecipeSiteActiveIn(user.db, user.id, uniqueDomain(), false)).toBe("missing");
  });

  it("never changes another user's sites", async () => {
    const owner = await createTestUser("sites-owner");
    const other = await createTestUser("sites-intruder");
    await insertUserDefaults(owner.db);
    await setRecipeSiteActiveIn(owner.db, owner.id, "ica.se", false);
    const before = await sitesOf(owner.id);

    // With the owner's id too: RLS hides the rows from the other user.
    expect(await setRecipeSiteActiveIn(other.db, owner.id, "koket.se", false)).toBe("missing");
    expect(await setRecipeSiteActiveIn(other.db, owner.id, "ica.se", true)).toBe("missing");
    expect(await setRecipeSiteActiveIn(other.db, other.id, "koket.se", false)).toBe("missing");
    // An insert for the owner is refused by RLS (42501), and the reactivation finds nothing.
    await expect(addRecipeSiteIn(other.db, owner.id, "ica.se")).rejects.toThrow(SettingsDataError);
    await expect(addRecipeSiteIn(other.db, owner.id, uniqueDomain())).rejects.toThrow(SettingsDataError);
    expect(await sitesOf(owner.id)).toEqual(before);

    // The other user's add lands on their own rows only.
    expect(await addRecipeSiteIn(other.db, other.id, "ica.se")).toBe("added");
    expect(await sitesOf(other.id)).toEqual([{ domain: "ica.se", is_active: true }]);
    expect(await sitesOf(owner.id)).toEqual(before);
  });
});
