import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadActiveRecipeDomains, loadSelectedStore, loadStores } from "@/features/settings/data/queries";
import { insertUserDefaults } from "@/features/settings/data/defaults";
import { SettingsDataError } from "@/features/settings/data/client";
import { clearAiSettingIn, loadAiSettingIn, saveAiSettingIn } from "@/features/settings/data/ai-setting";
import { insertAiUsageIn, loadAiUsageIn } from "@/features/settings/data/ai-usage";
import { addRecipeSiteIn, setRecipeSiteActiveIn } from "@/features/settings/data/sites";
import { saveStoreIn, selectStoreIn } from "@/features/settings/data/stores";
import { storeFormSchema, type StoreForm } from "@/features/settings";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, anonClient, createTestUser, deleteTestUsers, expectRlsIsolation } from "./support";

// The settings module against local Supabase (AD-4, AD-11, AD-21): RLS on
// recipe_site, the start data from ensure_user_defaults(), the domain rules
// in the table's check constraint, and adding, turning off and turning on
// sites from Inställningar (Story 1.12), and the stores with save_store and
// select_store (Story 7.1).

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
    expect(await setRecipeSiteActiveIn(user.db, "koket.se", false)).toBe("changed");
    expect(await setRecipeSiteActiveIn(user.db, "koket.se", false)).toBe("unchanged");
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "tasteline.com"]);
    expect(await sitesOf(user.id)).toContainEqual({ domain: "koket.se", is_active: false });

    // A new sign-in runs ensure_user_defaults() again.
    await insertUserDefaults(user.db);
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "tasteline.com"]);
  });

  it("turns an off site on again, by Ångra or by adding it again", async () => {
    const user = await createTestUser("sites-on");
    await insertUserDefaults(user.db);
    await setRecipeSiteActiveIn(user.db, "koket.se", false);
    expect(await setRecipeSiteActiveIn(user.db, "koket.se", true)).toBe("changed");
    expect(await setRecipeSiteActiveIn(user.db, "koket.se", true)).toBe("unchanged");
    expect(await loadActiveRecipeDomains(user.db)).toContain("koket.se");

    await setRecipeSiteActiveIn(user.db, "arla.se", false);
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
    expect(await setRecipeSiteActiveIn(user.db, uniqueDomain(), false)).toBe("missing");
  });

  it("never changes another user's sites", async () => {
    const owner = await createTestUser("sites-owner");
    const other = await createTestUser("sites-intruder");
    await insertUserDefaults(owner.db);
    await setRecipeSiteActiveIn(owner.db, "ica.se", false);
    const before = await sitesOf(owner.id);

    // RLS hides the owner's household's rows from the other user.
    expect(await setRecipeSiteActiveIn(other.db, "koket.se", false)).toBe("missing");
    expect(await setRecipeSiteActiveIn(other.db, "ica.se", true)).toBe("missing");
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

// Story 7.1: the stores (AD-1, AD-4, AD-21). Several stores per user are the
// normal case; at most one is selected.

const defaultStore = {
  name: "Maxi ICA Stormarknad Östersund",
  chain: "ICA",
  external_store_id: "1003733",
  address: null,
  url: "https://handlaprivatkund.ica.se/stores/1003733",
  offers_url: "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/",
  is_selected: true,
};

async function storesOf(userId: string) {
  const { data, error } = await adminClient()
    .from("store")
    .select("id, name, chain, external_store_id, address, url, offers_url, is_selected")
    .eq("user_id", userId)
    .order("created_at")
    .order("name");
  if (error) throw error;
  return data;
}

async function selectedOf(userId: string) {
  return (await storesOf(userId)).filter((store) => store.is_selected).map((store) => store.name);
}

const storeForm = (changes: Partial<StoreForm> = {}): StoreForm => ({
  id: crypto.randomUUID(),
  mode: "add",
  name: "Willys Lindhagen",
  chain: "Willys",
  externalStoreId: null,
  address: null,
  url: null,
  offersUrl: undefined,
  makeSelected: false,
  ...changes,
});

/** Saves `form` and returns the stored store; fails the test on any other outcome. */
async function saved(db: Parameters<typeof saveStoreIn>[0], form: StoreForm) {
  const outcome = await saveStoreIn(db, form);
  if (outcome.kind !== "saved") throw new Error(`expected saved, got ${outcome.kind}`);
  return outcome.store;
}

describe("store: schema and RLS", () => {
  it("isolates store", async () => {
    await expectRlsIsolation("store", async () => ({ name: "Coop Forum", chain: "Coop" }));
  });

  it("selects at most one store per user", async () => {
    const user = await createTestUser("store-one-selected");
    const other = await createTestUser("store-one-selected-other");
    expect((await user.db.from("store").insert({ name: "ICA Kvantum", chain: "ICA", is_selected: true })).error).toBeNull();
    expect((await user.db.from("store").insert({ name: "Coop", chain: "Coop", is_selected: true })).error?.code).toBe("23505");
    // Another user has a selected store of their own.
    expect((await other.db.from("store").insert({ name: "Coop", chain: "Coop", is_selected: true })).error).toBeNull();
  });

  it("refuses a chain outside STORE_CHAINS, a URL without https:// and empty or long texts", async () => {
    const user = await createTestUser("store-checks");
    const refused: { name: string; chain: string; url?: string; external_store_id?: string; address?: string }[] = [
      { name: "ICA Handla", chain: "ICA Handla" },
      { name: "Willys", chain: "willys" },
      { name: "Willys", chain: "Willys", url: "http://willys.se" },
      { name: "Willys", chain: "Willys", url: "javascript:alert(1)" },
      { name: "Willys", chain: "Willys", url: "willys.se" },
      { name: "Willys", chain: "Willys", url: "https://" },
      { name: "Willys", chain: "Willys", url: "https://willys .se" },
      { name: "Willys", chain: "Willys", url: `https://willys.se/${"a".repeat(2048)}` },
      { name: "   ", chain: "Willys" },
      { name: "Willys\nLindhagen", chain: "Willys" },
      { name: "a".repeat(101), chain: "Willys" },
      { name: "Willys", chain: "Willys", external_store_id: "" },
      { name: "Willys", chain: "Willys", external_store_id: "1".repeat(41) },
      { name: "Willys", chain: "Willys", address: "a".repeat(201) },
    ];
    for (const row of refused) {
      expect((await user.db.from("store").insert(row)).error?.code, JSON.stringify(row)).toBe("23514");
    }
    expect(await storesOf(user.id)).toEqual([]);
  });

  it("keeps a chain and store id once per user, and lets several stores without an id in", async () => {
    const user = await createTestUser("store-duplicate");
    const other = await createTestUser("store-duplicate-other");
    const ica = { name: "Maxi", chain: "ICA", external_store_id: "1003733" };
    expect((await user.db.from("store").insert(ica)).error).toBeNull();
    expect((await user.db.from("store").insert({ ...ica, name: "Maxi igen" })).error?.code).toBe("23505");
    // The same id at another chain, and the same store for another user, are fine.
    expect((await user.db.from("store").insert({ ...ica, chain: "Coop" })).error).toBeNull();
    expect((await other.db.from("store").insert(ica)).error).toBeNull();
    // Several stores without an id, also in the same chain (e.g. Lidl).
    expect((await user.db.from("store").insert({ name: "Lidl Lillänge", chain: "Lidl" })).error).toBeNull();
    expect((await user.db.from("store").insert({ name: "Lidl Odenskog", chain: "Lidl" })).error).toBeNull();
  });
});

describe("store: ensure_user_defaults()", () => {
  it("still adds the start recipe sites, active, together with the default store", async () => {
    const user = await createTestUser("store-defaults-all");
    await insertUserDefaults(user.db);
    expect(await sitesOf(user.id)).toEqual([
      { domain: "arla.se", is_active: true },
      { domain: "ica.se", is_active: true },
      { domain: "koket.se", is_active: true },
      { domain: "tasteline.com", is_active: true },
    ]);
    expect(await storesOf(user.id)).toEqual([{ id: expect.any(String), ...defaultStore }]);
    expect(await loadActiveRecipeDomains(user.db)).toEqual(["arla.se", "ica.se", "koket.se", "tasteline.com"]);
  });

  it("adds the default store, selected, and a second call changes nothing", async () => {
    const user = await createTestUser("store-defaults");
    await insertUserDefaults(user.db);
    const first = await storesOf(user.id);
    expect(first).toEqual([{ id: expect.any(String), ...defaultStore }]);

    await insertUserDefaults(user.db);
    expect(await storesOf(user.id)).toEqual(first);
  });

  it("never replaces or duplicates a default store Pontus has changed", async () => {
    const user = await createTestUser("store-defaults-changed");
    await insertUserDefaults(user.db);
    const [store] = await storesOf(user.id);
    const changed = await user.db
      .from("store")
      .update({ name: "Maxi Östersund", external_store_id: "1003734", address: "Krondikesvägen 97" })
      .eq("id", store.id);
    expect(changed.error).toBeNull();

    await insertUserDefaults(user.db);
    expect(await storesOf(user.id)).toEqual([
      { ...store, name: "Maxi Östersund", external_store_id: "1003734", address: "Krondikesvägen 97" },
    ]);
  });

  it("adds nothing for a user who has a store, selected or not", async () => {
    const user = await createTestUser("store-defaults-has-one");
    expect((await user.db.from("store").insert({ name: "Willys Lindhagen", chain: "Willys" })).error).toBeNull();
    await insertUserDefaults(user.db);
    expect((await storesOf(user.id)).map((store) => store.name)).toEqual(["Willys Lindhagen"]);
  });

  it("gives two sign-ins at once one default store", async () => {
    const user = await createTestUser("store-defaults-race");
    await Promise.all([insertUserDefaults(user.db), insertUserDefaults(user.db), insertUserDefaults(user.db)]);
    expect(await storesOf(user.id)).toEqual([{ id: expect.any(String), ...defaultStore }]);
  });
});

describe("store: reading", () => {
  it("maps the user's stores and the selected one", async () => {
    const user = await createTestUser("store-read");
    const other = await createTestUser("store-read-other");
    expect(await loadSelectedStore(user.db)).toBeNull();
    await insertUserDefaults(user.db);
    await insertUserDefaults(other.db);
    const willys = await saved(user.db, storeForm({ address: "Lindhagensgatan 1" }));

    const maxi = {
      id: expect.any(String),
      name: "Maxi ICA Stormarknad Östersund",
      chain: "ICA",
      externalStoreId: "1003733",
      address: null,
      url: "https://handlaprivatkund.ica.se/stores/1003733",
      offersUrl: "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/",
      isSelected: true,
    };
    expect(await loadSelectedStore(user.db)).toEqual(maxi);
    const stores = await loadStores(user.db);
    expect(stores).toHaveLength(2);
    expect(stores).toContainEqual(maxi);
    expect(stores).toContainEqual(willys);
  });
});

describe("store: save_store and select_store", () => {
  it("adds a store without selecting it, and changes it with the same id", async () => {
    const user = await createTestUser("store-save");
    await insertUserDefaults(user.db);
    const form = storeForm();
    expect(await saved(user.db, form)).toEqual({
      id: form.id,
      name: "Willys Lindhagen",
      chain: "Willys",
      externalStoreId: null,
      address: null,
      url: null,
      offersUrl: null,
      isSelected: false,
    });
    // A retry with the same id changes the same row.
    const changed = await saved(user.db, { ...form, address: "Lindhagensgatan 1", url: "https://www.willys.se/" });
    expect(changed).toMatchObject({ id: form.id, address: "Lindhagensgatan 1", url: "https://www.willys.se/", isSelected: false });
    expect(await storesOf(user.id)).toHaveLength(2);
    expect(await selectedOf(user.id)).toEqual(["Maxi ICA Stormarknad Östersund"]);
  });

  it("selects a saved store with make_selected, leaving exactly one selected", async () => {
    const user = await createTestUser("store-save-select");
    await insertUserDefaults(user.db);
    const willys = await saved(user.db, storeForm({ makeSelected: true }));
    expect(willys.isSelected).toBe(true);
    expect(await selectedOf(user.id)).toEqual(["Willys Lindhagen"]);

    // Changing the selected store without make_selected keeps it selected.
    expect((await saved(user.db, { ...storeForm({ id: willys.id }), address: "Lindhagensgatan 1" })).isSelected).toBe(true);
    expect(await selectedOf(user.id)).toEqual(["Willys Lindhagen"]);
  });

  it("selects another store with select_store, leaving exactly one selected", async () => {
    const user = await createTestUser("store-select");
    await insertUserDefaults(user.db);
    const [maxi] = await storesOf(user.id);
    const willys = await saved(user.db, storeForm({ makeSelected: true }));

    expect(await selectStoreIn(user.db, maxi.id)).toBe("selected");
    expect(await selectedOf(user.id)).toEqual(["Maxi ICA Stormarknad Östersund"]);
    // Selecting the selected store again changes nothing.
    expect(await selectStoreIn(user.db, maxi.id)).toBe("selected");
    expect(await selectStoreIn(user.db, willys.id)).toBe("selected");
    expect(await selectedOf(user.id)).toEqual(["Willys Lindhagen"]);
  });

  it("leaves exactly one store selected after selections at once", async () => {
    const user = await createTestUser("store-select-race");
    await insertUserDefaults(user.db);
    const stores = [
      (await storesOf(user.id))[0].id,
      (await saved(user.db, storeForm({ name: "Willys Lindhagen" }))).id,
      (await saved(user.db, storeForm({ name: "Coop Forum", chain: "Coop" }))).id,
      (await saved(user.db, storeForm({ name: "Lidl Lillänge", chain: "Lidl" }))).id,
    ];
    for (let round = 0; round < 3; round += 1) {
      // The per-user lock makes them run one after the other: every one goes
      // through, and the last to run is the selected store.
      const selections = stores.map((id) => selectStoreIn(user.db, id));
      const saves = [
        saveStoreIn(user.db, storeForm({ name: `Hemköp ${round}`, chain: "Hemköp", makeSelected: true })),
        saveStoreIn(user.db, storeForm({ name: `City Gross ${round}`, chain: "City Gross", makeSelected: true })),
      ];
      const outcomes = await Promise.allSettled([...selections, ...saves]);
      expect(outcomes.map((outcome) => outcome.status)).toEqual(Array(stores.length + 2).fill("fulfilled"));
      expect(await Promise.all(selections)).toEqual(Array(stores.length).fill("selected"));
      expect((await Promise.all(saves)).map((outcome) => outcome.kind)).toEqual(["saved", "saved"]);
      expect(await selectedOf(user.id)).toHaveLength(1);
    }
  });

  it("lets the last of two selections in a row win", async () => {
    const user = await createTestUser("store-select-last");
    await insertUserDefaults(user.db);
    const willys = await saved(user.db, storeForm());
    const coop = await saved(user.db, storeForm({ name: "Coop Forum", chain: "Coop" }));
    for (const id of [willys.id, coop.id, willys.id]) expect(await selectStoreIn(user.db, id)).toBe("selected");
    expect(await selectedOf(user.id)).toEqual(["Willys Lindhagen"]);
  });

  it("reports the same chain and store id as another store as duplicate, and two stores without an id are fine", async () => {
    const user = await createTestUser("store-save-duplicate");
    await insertUserDefaults(user.db);
    const before = await storesOf(user.id);
    expect(await saveStoreIn(user.db, storeForm({ name: "Maxi igen", chain: "ICA", externalStoreId: "1003733" }))).toEqual({
      kind: "duplicate",
    });
    expect(await storesOf(user.id)).toEqual(before);

    await saved(user.db, storeForm({ name: "Lidl Lillänge", chain: "Lidl" }));
    await saved(user.db, storeForm({ name: "Lidl Odenskog", chain: "Lidl", makeSelected: true }));
    expect(await storesOf(user.id)).toHaveLength(3);
    expect(await selectedOf(user.id)).toEqual(["Lidl Odenskog"]);
  });

  it("refuses what the table's checks refuse, and saves nothing", async () => {
    const user = await createTestUser("store-save-checks");
    await expect(saveStoreIn(user.db, storeForm({ chain: "Konsum" as never }))).rejects.toThrow("save_store 23514");
    await expect(saveStoreIn(user.db, storeForm({ url: "http://willys.se" }))).rejects.toThrow("save_store 23514");
    expect(await storesOf(user.id)).toEqual([]);
  });

  it("never selects or changes another user's store", async () => {
    const owner = await createTestUser("store-foreign-owner");
    const other = await createTestUser("store-foreign-intruder");
    await insertUserDefaults(owner.db);
    await insertUserDefaults(other.db);
    const willys = await saved(owner.db, storeForm());
    const before = await storesOf(owner.id);

    expect(await selectStoreIn(other.db, willys.id)).toBe("gone");
    const direct = await other.db.rpc("select_store", { store_id: willys.id });
    expect(direct.error?.code).toBe("P0002");
    // The owner's id cannot be taken over: an add meets the owner's row
    // (store_pkey, so the action tries again with a new id), and a change finds nothing.
    expect(await saveStoreIn(other.db, storeForm({ id: willys.id, name: "Kapad", makeSelected: true }))).toEqual({
      kind: "id_taken",
    });
    expect(await saveStoreIn(other.db, storeForm({ id: willys.id, name: "Kapad", mode: "change" }))).toEqual({ kind: "gone" });

    expect(await storesOf(owner.id)).toEqual(before);
    expect(await selectedOf(other.id)).toEqual(["Maxi ICA Stormarknad Östersund"]);
    expect(await storesOf(other.id)).toHaveLength(1);
  });

  it("cannot be called without a session", async () => {
    const anon = anonClient();
    expect((await anon.rpc("select_store", { store_id: crypto.randomUUID() })).error?.code).toBe("42501");
    expect(
      (
        await anon.rpc("save_store", {
          store: { id: crypto.randomUUID(), name: "x", chain: "ICA" },
          mode: "add",
          make_selected: false,
        })
      ).error?.code,
    ).toBe("42501");
  });

  it("changes only a store that is there with mode change", async () => {
    const user = await createTestUser("store-change");
    await insertUserDefaults(user.db);
    const before = await storesOf(user.id);
    expect(await saveStoreIn(user.db, storeForm({ mode: "change" }))).toEqual({ kind: "gone" });
    expect(await storesOf(user.id)).toEqual(before);

    const [maxi] = before;
    const changed = await saved(
      user.db,
      storeForm({ id: maxi.id, mode: "change", name: maxi.name, chain: "ICA", externalStoreId: "1003733", address: "Testgatan 1" }),
    );
    expect(changed).toMatchObject({ id: maxi.id, address: "Testgatan 1", isSelected: true });
  });

  it("selects a saved store when no store is selected, also without make_selected", async () => {
    const user = await createTestUser("store-first-selected");
    const lidl = await saved(user.db, storeForm({ name: "Lidl Lillänge", chain: "Lidl" }));
    expect(lidl.isSelected).toBe(true);
    const coop = await saved(user.db, storeForm({ name: "Coop Forum", chain: "Coop" }));
    expect(coop.isSelected).toBe(false);
    expect(await selectedOf(user.id)).toEqual(["Lidl Lillänge"]);
  });

  it("keeps a store id once per chain whatever its case", async () => {
    const user = await createTestUser("store-id-case");
    await saved(user.db, storeForm({ name: "Coop A", chain: "Coop", externalStoreId: "AB12" }));
    expect(await saveStoreIn(user.db, storeForm({ name: "Coop B", chain: "Coop", externalStoreId: "ab12" }))).toEqual({
      kind: "duplicate",
    });
    expect((await user.db.from("store").insert({ name: "Coop C", chain: "Coop", external_store_id: " ab12" })).error?.code).toBe(
      "23514",
    );
  });

  it("stores what oneLine leaves, and refuses separators, bidi controls and untrimmed text", async () => {
    const user = await createTestUser("store-one-line");
    const typed = " \u202eMaxi\u202c\u2028ICA\u2066 Östersund\u2069 ";
    const form = storeFormSchema.parse({
      id: crypto.randomUUID(),
      mode: "add",
      name: typed,
      chain: "ICA",
      externalStoreId: ` 10\u202a03\u2029733 `,
      address: `Testgatan\u2067 1\u0085`,
      url: "",
      makeSelected: false,
    });
    expect(form).toMatchObject({ name: "Maxi ICA Östersund", externalStoreId: "1003 733", address: "Testgatan 1" });
    await saved(user.db, form);
    for (const name of [typed, "Maxi\u2028ICA", "Maxi\u2029ICA", "Maxi \u202dICA", "Maxi\u2068", " Maxi", "Maxi "]) {
      expect((await user.db.from("store").insert({ name, chain: "Coop" })).error?.code, JSON.stringify(name)).toBe("23514");
    }
    for (const address of ["Testgatan\u20281", "Testgatan 1 "]) {
      expect((await user.db.from("store").insert({ name: "Coop", chain: "Coop", address })).error?.code).toBe("23514");
    }
    expect((await user.db.from("store").insert({ name: "Coop", chain: "Coop", url: "https://coop.se/\u202e" })).error?.code).toBe(
      "23514",
    );
  });

  it("never lets the user delete a store, which v1 does not do", async () => {
    const user = await createTestUser("store-no-delete");
    await insertUserDefaults(user.db);
    const [maxi] = await storesOf(user.id);
    expect((await user.db.from("store").delete().eq("id", maxi.id)).error?.code).toBe("42501");
    expect(await storesOf(user.id)).toHaveLength(1);
  });
});

describe("ai_setting (Story 17.5)", () => {
  it("isolates ai_setting", async () => {
    await expectRlsIsolation("ai_setting", async () => ({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" }));
  });

  it("keeps one row per user: saves, replaces, reads and clears the choice", async () => {
    const user = await createTestUser("ai-setting");
    expect(await loadAiSettingIn(user.db)).toBeNull();
    await saveAiSettingIn(user.db, user.id, { provider: "anthropic", model: "claude-opus-5-5", effort: "high" });
    await saveAiSettingIn(user.db, user.id, { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" });
    expect(await loadAiSettingIn(user.db)).toEqual({ provider: "anthropic", model: "claude-haiku-5-5", effort: "low" });
    const { data } = await adminClient().from("ai_setting").select("id").eq("user_id", user.id);
    expect(data).toHaveLength(1);
    await clearAiSettingIn(user.db);
    expect(await loadAiSettingIn(user.db)).toBeNull();
  });

  it("refuses a provider, a level or a model length the table does not allow", async () => {
    const user = await createTestUser("ai-setting-bad");
    const insert = (row: Record<string, string>) => user.db.from("ai_setting").insert({ provider: "anthropic", model: "m", effort: "low", ...row });
    expect((await insert({ provider: "openai" })).error?.code).toBe("23514");
    expect((await insert({ effort: "max" })).error?.code).toBe("23514");
    expect((await insert({ model: "" })).error?.code).toBe("23514");
  });
});

describe("ai_usage (Story 17.6)", () => {
  it("isolates ai_usage", async () => {
    await expectRlsIsolation("ai_usage", async () => ({ model: "claude-haiku-5-5", input_tokens: 10, output_tokens: 5 }));
  });

  it("records calls and sums them per model within a month, for the user only", async () => {
    const user = await createTestUser("ai-usage");
    const other = await createTestUser("ai-usage-other");
    await insertAiUsageIn(user.db, { model: "claude-haiku-5-5", inputTokens: 1000, outputTokens: 200 });
    await insertAiUsageIn(user.db, { model: "claude-haiku-5-5", inputTokens: 500, outputTokens: 100 });
    await insertAiUsageIn(user.db, { model: "mock", inputTokens: 0, outputTokens: 0 });
    await insertAiUsageIn(other.db, { model: "claude-opus-5-5", inputTokens: 9, outputTokens: 9 });
    // A call from before the month, written behind RLS's back so its time can be set.
    const old = await adminClient()
      .from("ai_usage")
      .insert({ user_id: user.id, model: "claude-haiku-5-5", input_tokens: 7, output_tokens: 7, created_at: "2020-01-15T10:00:00Z" });
    expect(old.error).toBeNull();

    const from = new Date(Date.now() - 60_000);
    const to = new Date(Date.now() + 60_000);
    const models = (await loadAiUsageIn(user.db, from, to)).sort((a, b) => a.model.localeCompare(b.model));
    expect(models).toEqual([
      { model: "claude-haiku-5-5", calls: 2, inputTokens: 1500, outputTokens: 300 },
      { model: "mock", calls: 1, inputTokens: 0, outputTokens: 0 },
    ]);
    expect(await loadAiUsageIn(user.db, new Date("2020-01-01T00:00:00Z"), new Date("2020-02-01T00:00:00Z"))).toEqual([
      { model: "claude-haiku-5-5", calls: 1, inputTokens: 7, outputTokens: 7 },
    ]);
  });

  it("refuses negative tokens and an empty model", async () => {
    const user = await createTestUser("ai-usage-bad");
    const insert = (row: Record<string, unknown>) => user.db.from("ai_usage").insert({ model: "m", input_tokens: 1, output_tokens: 1, ...row });
    expect((await insert({ input_tokens: -1 })).error?.code).toBe("23514");
    expect((await insert({ output_tokens: -1 })).error?.code).toBe("23514");
    expect((await insert({ model: "" })).error?.code).toBe("23514");
  });
});
