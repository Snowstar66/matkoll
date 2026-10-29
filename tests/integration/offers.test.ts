import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, weekStartOf, type OfferDraft } from "@/features/offers";
import { blockFetch, claimFetch, loadActiveOffers, loadLastFetch, loadOffers } from "@/features/offers/data/queries";
import { saveOffersIn } from "@/features/offers/data/save";
import { saveStoreIn } from "@/features/settings/data/stores";
import { storeFormSchema } from "@/features/settings";
import { fail } from "@/lib/errors";
import { localSupabaseUrl } from "../local-supabase";
import { adminClient, countRows, createTestUser, deleteTestUsers, expectRlsIsolation, type Db, type TestUser } from "./support";

// The offers module against local Supabase (Story 9.1, AD-4, AD-25): RLS on
// store_offer, save_store_offers (replacing the link's rows, merging by
// label, the limit of 300, the weeks it takes and the ones it removes,
// another user's store) and store.offers_url with save_store and
// ensure_user_defaults().

const maxiLink = "https://www.ica.se/erbjudanden/maxi-ica-stormarknad-ostersund-1003733/";

let unique = 0;

async function addStore(db: Db, changes: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db
    .from("store")
    .insert({ name: `Butik ${unique++}`, chain: "ICA", ...changes })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function draft(label: string, changes: Partial<OfferDraft> = {}): OfferDraft {
  return {
    label,
    name: label.toLowerCase(),
    ingredientId: null,
    section: "Övrigt",
    price: "10 kr",
    note: null,
    memberOnly: false,
    validTo: null,
    source: "link",
    regularPrice: null,
    savingPercent: null,
    ...changes,
  };
}

async function labelsOf(userId: string, storeId: string, week: string) {
  const { data, error } = await adminClient()
    .from("store_offer")
    .select("label, source")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .eq("week_start", week)
    .order("created_at");
  if (error) throw error;
  return data.map((row) => `${row.label} (${row.source})`);
}

const thisWeek = () => weekStartOf(new Date());

beforeAll(() => {
  localSupabaseUrl();
});

afterAll(async () => {
  await deleteTestUsers();
});

describe("schema and RLS", () => {
  it("isolates store_offer", async () => {
    await expectRlsIsolation("store_offer", async (owner) => ({
      store_id: await addStore(owner),
      week_start: thisWeek(),
      label: "Havets Laxfilé",
      name: "laxfilé",
      section: "Kött och fisk",
      source: "link",
    }));
  });

  it("gives no grant to anon, and keys the label in lower case with single spaces", async () => {
    const user = await createTestUser("offer-key");
    const store = await addStore(user.db);
    const inserted = await user.db
      .from("store_offer")
      .insert({ store_id: store, week_start: thisWeek(), label: "Scan  FALUKORV", name: "falukorv", section: "Chark", source: "link" })
      .select("label_key")
      .single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.label_key).toBe("scan falukorv");
  });

  it.each([
    ["a week that does not start on a Monday", { week_start: addDays(thisWeekValue(), 1) }],
    ["an empty label", { label: " " }],
    ["a label of 121 characters", { label: "a".repeat(121) }],
    ["a name of 101 characters", { name: "a".repeat(101) }],
    ["a price of 41 characters", { price: "a".repeat(41) }],
    ["a note of 81 characters", { note: "a".repeat(81) }],
    ["a line break", { label: "Falu\nkorv" }],
    ["an unknown section", { section: "Godis" }],
    ["an unknown source", { source: "ai" }],
    ["an end before the week", { valid_to: addDays(thisWeekValue(), -1) }],
    ["a regular price of 0", { regular_price: 0 }],
    ["a saving of 0 %", { saving_percent: 0 }],
    ["a saving of 100 %", { saving_percent: 100 }],
  ])("refuses %s", async (_name, changes) => {
    const user = await createTestUser(`offer-check-${unique++}`);
    const store = await addStore(user.db);
    const { error } = await user.db
      .from("store_offer")
      .insert({ store_id: store, week_start: thisWeek(), label: "Falukorv", name: "falukorv", section: "Chark", source: "link", ...changes });
    expect(error?.code).toBe("23514");
  });

  it("refuses another user's store and another user's catalog ingredient", async () => {
    const owner = await createTestUser("offer-owner");
    const other = await createTestUser("offer-other");
    const otherStore = await addStore(other.db);
    const ingredient = await other.db
      .from("ingredient")
      .insert({ name: "Laxfilé", normalized_name: "laxfilé", section: "Kött och fisk", location: "Kyl" })
      .select("id")
      .single();
    if (ingredient.error) throw ingredient.error;
    const own = await addStore(owner.db);
    const row = { week_start: thisWeek(), label: "Laxfilé", name: "laxfilé", section: "Kött och fisk", source: "link" };
    expect((await owner.db.from("store_offer").insert({ ...row, store_id: otherStore })).error?.code).toBe("23503");
    expect((await owner.db.from("store_offer").insert({ ...row, store_id: own, ingredient_id: ingredient.data.id })).error?.code).toBe(
      "23503",
    );
  });
});

/** This week's Monday, for the table of refused rows above (read when the test runs). */
function thisWeekValue() {
  return weekStartOf(new Date());
}

describe("save_store_offers", () => {
  let user: TestUser;
  let store: string;

  beforeAll(async () => {
    user = await createTestUser("offer-save");
    store = await addStore(user.db, { offers_url: maxiLink });
  });

  it("saves the offers in the page's order and gives the week's count", async () => {
    const week = thisWeek();
    const saved = await saveOffersIn(user.db, {
      storeId: store,
      weekStart: week,
      items: [draft("Gårdens Herrgård, Präst"), draft("Havets Laxfilé"), draft("Odlarna Gul lök")],
      replaceSource: "link",
    });
    expect(saved).toEqual({ ok: true, data: 3 });
    expect((await loadOffers(user.db, store, week)).map((offer) => offer.label)).toEqual([
      "Gårdens Herrgård, Präst",
      "Havets Laxfilé",
      "Odlarna Gul lök",
    ]);
  });

  it("saves the regular price and the saving, and null when they are not known (Story 9.11)", async () => {
    const week = thisWeek();
    const saved = await saveOffersIn(user.db, {
      storeId: store,
      weekStart: week,
      items: [draft("Gårdens Herrgård", { regularPrice: 111.9, savingPercent: 20 }), draft("Odlarna Gul lök")],
      replaceSource: "link",
    });
    expect(saved).toEqual({ ok: true, data: 2 });
    const offers = await loadOffers(user.db, store, week);
    expect(offers.map((offer) => [offer.regularPrice, offer.savingPercent])).toEqual([
      [111.9, 20],
      [null, null],
    ]);
  });

  it("replaces the store's link rows for the week, and keeps the offers from text", async () => {
    const week = thisWeek();
    const fresh = await createTestUser("offer-replace");
    const own = await addStore(fresh.db);
    await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: [draft("Falukorv"), draft("Gul lök")], replaceSource: "link" });
    await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: [draft("Kaffe", { source: "text" })] });
    const again = await saveOffersIn(fresh.db, {
      storeId: own,
      weekStart: week,
      items: [draft("Gul lök", { price: "8 kr" }), draft("Mjölk")],
      replaceSource: "link",
    });
    expect(again).toEqual({ ok: true, data: 3 });
    expect((await labelsOf(fresh.id, own, week)).sort()).toEqual(["Gul lök (link)", "Kaffe (text)", "Mjölk (link)"]);
  });

  it("merges by label key: one row per label, and two brands of the same item are two rows", async () => {
    const week = thisWeek();
    const fresh = await createTestUser("offer-merge");
    const own = await addStore(fresh.db);
    const saved = await saveOffersIn(fresh.db, {
      storeId: own,
      weekStart: week,
      items: [draft("Scan Falukorv", { price: "29 kr" }), draft("scan  falukorv", { price: "30 kr" }), draft("Ica Falukorv")],
    });
    expect(saved).toEqual({ ok: true, data: 2 });
    const offers = await loadOffers(fresh.db, own, week);
    expect(offers.map((offer) => [offer.label, offer.price])).toEqual([
      ["Scan Falukorv", "29 kr"],
      ["Ica Falukorv", "10 kr"],
    ]);
    // Saving the same label again changes the row instead of adding one.
    await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: [draft("SCAN FALUKORV", { price: "25 kr", source: "text" })] });
    expect((await loadOffers(fresh.db, own, week)).find((offer) => offer.label === "Scan Falukorv")?.price).toBe("25 kr");
    expect(await countRows("store_offer", fresh.id)).toBe(2);
  });

  it("refuses more than 300 offers for the store and week, and saves nothing", async () => {
    const week = thisWeek();
    const fresh = await createTestUser("offer-limit");
    const own = await addStore(fresh.db);
    const text = Array.from({ length: 295 }, (_, index) => draft(`Vara ${index}`, { source: "text" }));
    expect(await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: text })).toEqual({ ok: true, data: 295 });
    const link = Array.from({ length: 10 }, (_, index) => draft(`Länkvara ${index}`));
    expect(await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: link, replaceSource: "link" })).toEqual(
      fail("offers_limit"),
    );
    expect(await countRows("store_offer", fresh.id)).toBe(295);
  });

  it("takes this week and next, and refuses a week that is over or further ahead", async () => {
    const week = thisWeek();
    expect((await saveOffersIn(user.db, { storeId: store, weekStart: addDays(week, 7), items: [draft("Nästa vecka")] })).ok).toBe(true);
    for (const refused of [addDays(week, -7), addDays(week, 14), addDays(week, 1)]) {
      expect(await saveOffersIn(user.db, { storeId: store, weekStart: refused, items: [draft("Fel vecka")] }), refused).toEqual(
        fail("offers_week_invalid"),
      );
    }
  });

  it("removes the user's offers for weeks that are over when it saves", async () => {
    const week = thisWeek();
    const fresh = await createTestUser("offer-old");
    const own = await addStore(fresh.db);
    const old = await adminClient()
      .from("store_offer")
      .insert({ user_id: fresh.id, store_id: own, week_start: addDays(week, -7), label: "Gammal", name: "gammal", section: "Övrigt", source: "link" });
    expect(old.error).toBeNull();
    await saveOffersIn(fresh.db, { storeId: own, weekStart: week, items: [draft("Ny")] });
    expect(await labelsOf(fresh.id, own, addDays(week, -7))).toEqual([]);
    expect(await labelsOf(fresh.id, own, week)).toEqual(["Ny (link)"]);
  });

  it("saves nothing for another user's store", async () => {
    const other = await createTestUser("offer-intruder");
    expect(await saveOffersIn(other.db, { storeId: store, weekStart: thisWeek(), items: [draft("Intrång")] })).toEqual(
      fail("offers_store_missing"),
    );
    expect(await countRows("store_offer", other.id)).toBe(0);
  });
});

describe("reading the offers", () => {
  it("gives the latest week that is not over, without offers that have ended, and the last fetch", async () => {
    const week = thisWeek();
    const user = await createTestUser("offer-read");
    const store = await addStore(user.db);
    expect(await loadActiveOffers(user.db, store, new Date())).toEqual([]);
    expect(await loadLastFetch(user.db, store)).toBeNull();

    await saveOffersIn(user.db, { storeId: store, weekStart: week, items: [draft("Denna vecka")], replaceSource: "link" });
    // An offer of this week whose last day has passed (set behind the function's back).
    const ended = await adminClient()
      .from("store_offer")
      .insert({ user_id: user.id, store_id: store, week_start: week, label: "Slut", name: "slut", section: "Övrigt", source: "text", valid_to: week });
    expect(ended.error).toBeNull();
    const now = new Date(`${addDays(week, 2)}T12:00:00+01:00`);
    expect((await loadActiveOffers(user.db, store, now)).map((offer) => offer.label)).toEqual(["Denna vecka"]);

    await saveOffersIn(user.db, { storeId: store, weekStart: addDays(week, 7), items: [draft("Nästa vecka")], replaceSource: "link" });
    expect((await loadActiveOffers(user.db, store, new Date())).map((offer) => offer.label)).toEqual(["Nästa vecka"]);
    const last = await loadLastFetch(user.db, store);
    expect(last && Date.now() - last.getTime()).toBeLessThan(60_000);
  });
});

describe("store.offers_url", () => {
  it("refuses a link that is not https, has whitespace or is over 300 characters", async () => {
    const user = await createTestUser("offers-url-check");
    for (const offers_url of ["http://www.ica.se/erbjudanden/x-1/", "https://www.ica.se/erbjudanden/a b-1/", `https://www.ica.se/${"a".repeat(290)}/`]) {
      const { error } = await user.db.from("store").insert({ name: `Butik ${unique++}`, chain: "ICA", offers_url });
      expect(error?.code, offers_url).toBe("23514");
    }
  });

  it("saves the link with save_store, and keeps it when the form sends no link", async () => {
    const user = await createTestUser("offers-url-save");
    const form = storeFormSchema.parse({
      id: crypto.randomUUID(),
      mode: "add",
      name: "Maxi",
      chain: "ICA",
      externalStoreId: "",
      address: "",
      url: "",
      offersUrl: maxiLink,
      makeSelected: true,
    });
    const saved = await saveStoreIn(user.db, form);
    expect(saved.kind === "saved" && saved.store.offersUrl).toBe(maxiLink);

    const kept = await saveStoreIn(user.db, { ...form, mode: "change", name: "Maxi Östersund", offersUrl: undefined });
    expect(kept.kind === "saved" && kept.store).toMatchObject({ name: "Maxi Östersund", offersUrl: maxiLink });

    const removed = await saveStoreIn(user.db, { ...form, mode: "change", offersUrl: null });
    expect(removed.kind === "saved" && removed.store.offersUrl).toBeNull();
  });

  it("gives a new user's default store the link to its offers", async () => {
    const user = await createTestUser("offers-url-defaults");
    expect((await user.db.rpc("ensure_user_defaults")).error).toBeNull();
    const { data } = await adminClient().from("store").select("external_store_id, offers_url").eq("user_id", user.id);
    expect(data).toEqual([{ external_store_id: "1003733", offers_url: maxiLink }]);
  });

  it("never changes a store the user already has", async () => {
    const user = await createTestUser("offers-url-existing");
    await addStore(user.db, { name: "Maxi", external_store_id: "1003733", is_selected: true });
    expect((await user.db.rpc("ensure_user_defaults")).error).toBeNull();
    const { data } = await adminClient().from("store").select("offers_url").eq("user_id", user.id);
    expect(data).toEqual([{ offers_url: null }]);
  });
});

describe("store.offers_attempted_at", () => {
  const minute = 60_000;
  const attemptedAt = async (storeId: string) => {
    const { data, error } = await adminClient().from("store").select("offers_attempted_at").eq("id", storeId).single();
    if (error) throw error;
    return data.offers_attempted_at ? new Date(data.offers_attempted_at) : null;
  };

  it("lets the first attempt claim, and throttles the next within 15 minutes even though nothing was saved", async () => {
    const user = await createTestUser("offers-claim");
    const store = await addStore(user.db);
    expect(await attemptedAt(store)).toBeNull();
    const now = new Date();
    expect(await claimFetch(user.db, store, now)).toBe(true);
    expect((await attemptedAt(store))?.getTime()).toBe(now.getTime());
    // No offer was saved, yet the store is not asked again.
    expect(await claimFetch(user.db, store, new Date(now.getTime() + 5 * minute))).toBe(false);
    expect(await claimFetch(user.db, store, new Date(now.getTime() + 16 * minute))).toBe(true);
  });

  it("throttles for 6 hours after a 403 or 429", async () => {
    const user = await createTestUser("offers-block");
    const store = await addStore(user.db);
    const now = new Date();
    expect(await claimFetch(user.db, store, now)).toBe(true);
    await blockFetch(user.db, store, now);
    expect(await claimFetch(user.db, store, new Date(now.getTime() + 20 * minute))).toBe(false);
    expect(await claimFetch(user.db, store, new Date(now.getTime() + 5 * 60 * minute))).toBe(false);
    expect(await claimFetch(user.db, store, new Date(now.getTime() + 6 * 60 * minute + minute))).toBe(true);
  });

  it("lets only one of several attempts at the same time claim", async () => {
    const user = await createTestUser("offers-race");
    const store = await addStore(user.db);
    const now = new Date();
    const claims = await Promise.all(Array.from({ length: 8 }, () => claimFetch(user.db, store, now)));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("never claims another user's store", async () => {
    const owner = await createTestUser("offers-claim-owner");
    const store = await addStore(owner.db);
    const other = await createTestUser("offers-claim-other");
    expect(await claimFetch(other.db, store, new Date())).toBe(false);
    await blockFetch(other.db, store, new Date());
    expect(await attemptedAt(store)).toBeNull();
  });
});
