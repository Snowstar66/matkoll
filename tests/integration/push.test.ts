import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadPreferencesIn, removeSubscriptionIn, savePreferencesIn, saveSubscriptionIn } from "@/features/push/data/push";
import { insertNoteIn } from "@/features/notes/data/notes";
import { thingPhotoPath } from "@/features/things/domain/thing-photo";
import { claimBatchesIn, dropSubscriptionsIn, flushPushBatchesIn, type SendPush } from "@/lib/push-send";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Push-notiser (Story 23.3): devices and choices are a person's own; every
// change that is told about is queued by the database with who made it; the
// household's due batches are claimed once, with the count, for the others and
// by their choices; a device the push service refuses is removed. The tables
// are also covered, with the others, by household-isolation.test.ts.

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;

const device = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${randomUUID()}`, p256dh: "key", auth: "secret" });
const quiet = 0;
const maxWait = 300;

async function addItem(user: TestUser, label = "Mjölk") {
  const added = await user.db.from("shopping_custom_item").insert({ id: randomUUID(), label }).select("id").single();
  expect(added.error).toBeNull();
}

async function queued(household: string) {
  const { data, error } = await adminClient().from("push_event").select("kind, actor_id").eq("household_id", household);
  expect(error).toBeNull();
  return data ?? [];
}

beforeAll(async () => {
  a = await createTestUser("push-a");
  a2 = await createTestUser("push-a2");
  b = await createTestUser("push-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

beforeEach(async () => {
  // Every test starts with an empty queue and no devices, so counts are exact.
  await adminClient().from("push_event").delete().in("household_id", [householdA, householdB]);
  await adminClient().from("push_subscription").delete().in("user_id", [a.id, a2.id, b.id]);
  await adminClient().from("push_preference").delete().in("user_id", [a.id, a2.id, b.id]);
});

describe("devices and choices", () => {
  it("are a person's own: the household's other members and other households see none", async () => {
    const mine = device("a");
    await saveSubscriptionIn(a.db, mine);
    await savePreferencesIn(a.db, { lista: false, forrad: true, matsedel: true, lappar: false });
    expect((await a2.db.from("push_subscription").select("id")).data).toEqual([]);
    expect((await b.db.from("push_subscription").select("id")).data).toEqual([]);
    expect(await loadPreferencesIn(a.db)).toEqual({ lista: false, forrad: true, matsedel: true, lappar: false });
    expect(await loadPreferencesIn(a2.db), "a2 has made no choice: the defaults").toEqual({ lista: true, forrad: false, matsedel: false, lappar: true });
    expect((await anonClient().from("push_subscription").select("id")).error?.code).toBe("42501");
    // Saving the choices twice changes the one row.
    await savePreferencesIn(a.db, { lista: true, forrad: true, matsedel: false, lappar: true });
    expect((await adminClient().from("push_preference").select("id").eq("user_id", a.id)).data).toHaveLength(1);
  });

  it("move to the account that turns notifications on from the same device, and go with Stäng av", async () => {
    const shared = device("shared");
    await saveSubscriptionIn(a.db, shared);
    await saveSubscriptionIn(b.db, shared);
    const rows = (await adminClient().from("push_subscription").select("user_id").eq("endpoint", shared.endpoint)).data;
    expect(rows).toEqual([{ user_id: b.id }]);
    await removeSubscriptionIn(a.db, shared.endpoint);
    expect((await adminClient().from("push_subscription").select("id").eq("endpoint", shared.endpoint)).data, "not a's to remove").toHaveLength(1);
    await removeSubscriptionIn(b.db, shared.endpoint);
    expect((await adminClient().from("push_subscription").select("id").eq("endpoint", shared.endpoint)).data).toEqual([]);
  });

  it("refuse a plain-http endpoint and a row written for someone else", async () => {
    expect((await a.db.rpc("save_push_subscription", { device_endpoint: "http://fcm.googleapis.com/fcm/send/x", device_p256dh: "k", device_auth: "a" })).error?.code).toBe("23514");
    for (const endpoint of ["https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://evil.example/?a=.push.apple.com/"]) {
      expect((await a.db.rpc("save_push_subscription", { device_endpoint: endpoint, device_p256dh: "k", device_auth: "a" })).error?.code, endpoint).toBe("23514");
    }
    const forB =await a.db.from("push_subscription").insert({ user_id: b.id, ...device("x") } as never);
    expect(forB.error, "user_id is not granted for insert").not.toBeNull();
    expect((await anonClient().rpc("save_push_subscription", { device_endpoint: "https://fcm.googleapis.com/fcm/send/x", device_p256dh: "k", device_auth: "a" })).error?.code).toBe("42501");
  });
});

describe("the queue", () => {
  it("is empty and unreadable for every client", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await addItem(a);
    expect(await queued(householdA)).toHaveLength(1);
    for (const client of [a.db, a2.db, anonClient()]) {
      const read = await client.from("push_event" as never).select("*");
      expect(read.error?.code, "no grant").toBe("42501");
    }
  });

  it("gets one row per change, with who made it, for the four kinds, when someone else could be told", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await addItem(a);
    await addItem(a);
    expect(await insertNoteIn(a.db, { text: "Fisksoppa?", mood: null, actions: [], replyTo: null })).toBe("sent");
    const rows = await queued(householdA);
    expect(rows.filter((row) => row.kind === "lista")).toHaveLength(2);
    expect(rows.filter((row) => row.kind === "lappar")).toHaveLength(1);
    expect(new Set(rows.map((row) => row.actor_id))).toEqual(new Set([a.id]));
  });

  it("is left alone when nobody else in the household has a device (the maker's own devices do not count)", async () => {
    await saveSubscriptionIn(a.db, device("a"));
    await addItem(a);
    expect(await queued(householdA)).toEqual([]);
    await saveSubscriptionIn(b.db, device("b"));
    await addItem(a);
    expect(await queued(householdA), "a device in another household does not count").toEqual([]);
  });

  it("takes in a change of the meal plan, a changed weekday included", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    const recipe = await a.db.from("recipe").insert({ title: "Fisksoppa", original_servings: 2, source_kind: "url", source_url: "https://www.koket.se/kapat" } as never).select("id").single();
    expect(recipe.error).toBeNull();
    const added = await a.db.rpc("add_to_current_plan", {
      dish_id: randomUUID(),
      dish_recipe_id: (recipe.data as unknown as { id: string }).id,
      dish_recipe_title: "Fisksoppa",
      dish_servings: 2,
      plan_name: "Vecka 1",
    });
    expect(added.error).toBeNull();
    const plan = (await queued(householdA)).filter((row) => row.kind === "matsedel");
    expect(plan.length).toBeGreaterThanOrEqual(1);
    const dishes = await a.db.from("meal_plan_recipe").select("id, weekday");
    const dish = dishes.data![0];
    await adminClient().from("push_event").delete().eq("household_id", householdA);
    const moved = await a.db.from("meal_plan_recipe").update({ weekday: dish.weekday === 3 ? 4 : 3 }).eq("id", dish.id);
    expect(moved.error).toBeNull();
    expect((await queued(householdA)).filter((row) => row.kind === "matsedel")).toHaveLength(1);
  });
});

describe("the queue, cards", () => {
  it("takes in a new card in Förråd", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    const site = await a.db.from("pantry_site").insert({ name: "Stugan", normalized_name: `stugan-${randomUUID()}`, is_selected: true }).select("id").single();
    expect(site.error).toBeNull();
    const place = await a.db
      .from("thing_place")
      .insert({ site_id: site.data!.id, room: "Förrådet", part: "Hyllan", room_key: "förrådet", part_key: "hyllan" })
      .select("id")
      .single();
    expect(place.error).toBeNull();
    const id = randomUUID();
    const card = await a.db.from("thing_photo").insert({
      id,
      place_id: place.data!.id,
      object_path: thingPhotoPath(a.id, place.data!.id, id, "image/jpeg"),
      media_type: "image/jpeg",
      width: 10,
      height: 10,
      taken_at: new Date().toISOString(),
    });
    expect(card.error).toBeNull();
    expect((await queued(householdA)).filter((row) => row.kind === "forrad")).toEqual([{ kind: "forrad", actor_id: a.id }]);
  });
});

describe("claim_push_batches", () => {
  it("collects several changes into one batch, for the others and never the maker, and empties the queue", async () => {
    const phone = device("a2-phone");
    const tablet = device("a2-tablet");
    await saveSubscriptionIn(a2.db, phone);
    await saveSubscriptionIn(a2.db, tablet);
    await saveSubscriptionIn(a.db, device("a"));
    for (const label of ["Mjölk", "Ägg", "Smör"]) await addItem(a, label);
    const claimed = await claimBatchesIn(a.db, quiet, maxWait);
    expect(claimed.map((target) => [target.endpoint, target.batch.kind, target.batch.count]).sort()).toEqual(
      [[phone.endpoint, "lista", 3], [tablet.endpoint, "lista", 3]].sort(),
    );
    expect(await queued(householdA), "claimed once").toEqual([]);
    expect(await claimBatchesIn(a.db, quiet, maxWait), "nothing is sent twice").toEqual([]);
  });

  it("tells the maker nothing but the other member of what the maker did, and the maker of what the other did", async () => {
    await saveSubscriptionIn(a.db, device("a"));
    await saveSubscriptionIn(a2.db, device("a2"));
    await addItem(a);
    await addItem(a2);
    const claimed = await claimBatchesIn(a2.db, quiet, maxWait);
    expect(claimed).toHaveLength(2);
    for (const target of claimed) expect(target.batch.count, "each is told of the other's one item only").toBe(1);
  });

  it("waits while the household is still adding, and sends after the longest wait whatever happens", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await addItem(a);
    expect(await claimBatchesIn(a.db, 3600, maxWait), "not quiet yet").toEqual([]);
    expect(await queued(householdA)).toHaveLength(1);
    await adminClient().from("push_event").update({ created_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("household_id", householdA);
    await addItem(a);
    expect(await claimBatchesIn(a.db, 3600, maxWait), "the oldest has waited long enough").toHaveLength(1);
  });

  it("follows each member's choices: the list and notes on, Förråd and the meal plan off, until chosen", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await adminClient().from("push_event").insert([
      { household_id: householdA, kind: "lista", actor_id: a.id },
      { household_id: householdA, kind: "forrad", actor_id: a.id },
      { household_id: householdA, kind: "matsedel", actor_id: a.id },
      { household_id: householdA, kind: "lappar", actor_id: a.id },
    ]);
    const byDefault = await claimBatchesIn(a.db, quiet, maxWait);
    expect(byDefault.map((target) => target.batch.kind).sort()).toEqual(["lappar", "lista"]);
    await savePreferencesIn(a2.db, { lista: false, forrad: true, matsedel: true, lappar: false });
    await adminClient().from("push_event").insert([
      { household_id: householdA, kind: "lista", actor_id: a.id },
      { household_id: householdA, kind: "forrad", actor_id: a.id },
      { household_id: householdA, kind: "matsedel", actor_id: a.id },
      { household_id: householdA, kind: "lappar", actor_id: a.id },
    ]);
    const chosen = await claimBatchesIn(a.db, quiet, maxWait);
    expect(chosen.map((target) => target.batch.kind).sort()).toEqual(["forrad", "matsedel"]);
  });

  it("brings the author and the text only for a single note", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await insertNoteIn(a.db, { text: "Sugen på fisksoppa idag", mood: "yum", actions: [], replyTo: null });
    const [single] = await claimBatchesIn(a2.db, quiet, maxWait);
    expect(single.batch).toMatchObject({ kind: "lappar", count: 1, noteText: "Sugen på fisksoppa idag" });
    expect(single.batch.actorName).toBeTruthy();
    await insertNoteIn(a.db, { text: "Och en till", mood: null, actions: [], replyTo: null });
    await insertNoteIn(a.db, { text: "Och en till", mood: null, actions: [], replyTo: null });
    const [several] = await claimBatchesIn(a2.db, quiet, maxWait);
    expect(several.batch).toMatchObject({ kind: "lappar", count: 2, noteText: null, actorName: null });
  });

  it("quotes the note as it was written, whatever happens to it before the claim", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await insertNoteIn(a.db, { text: "Första lappen", mood: null, actions: [], replyTo: null });
    await adminClient().from("household_note").delete().eq("household_id", householdA).eq("user_id", a.id);
    const [single] = await claimBatchesIn(a2.db, quiet, maxWait);
    expect(single.batch).toMatchObject({ count: 1, noteText: "Första lappen" });
  });

  it("drops events that can never be sent: a day old, or a household without any device", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await adminClient().from("push_event").insert({ household_id: householdA, kind: "lista", actor_id: a.id, created_at: old });
    await adminClient().from("push_event").insert({ household_id: householdB, kind: "lista", actor_id: b.id, created_at: old });
    expect(await claimBatchesIn(a.db, 3600, maxWait)).toEqual([]);
    expect(await queued(householdA), "old events are pruned even when not due").toEqual([]);
    expect(await queued(householdB), "so are other households' old events").toEqual([]);
    await adminClient().from("push_subscription").delete().in("user_id", [a.id, a2.id, b.id]);
    await adminClient().from("push_event").insert({ household_id: householdA, kind: "lista", actor_id: a.id });
    expect(await claimBatchesIn(a.db, 3600, maxWait)).toEqual([]);
    expect(await queued(householdA), "nobody has a device").toEqual([]);
  });

  it("works on the caller's own household only", async () => {
    await saveSubscriptionIn(a2.db, device("a2"));
    await addItem(a);
    expect(await claimBatchesIn(b.db, quiet, maxWait), "B claims nothing of A's").toEqual([]);
    expect(await queued(householdA)).toHaveLength(1);
    expect((await anonClient().rpc("claim_push_batches")).error?.code).toBe("42501");
    expect(householdB).not.toBe(householdA);
  });
});

describe("sending", () => {
  it("sends one message per device and kind, and removes a device the push service says is gone, silently", async () => {
    const good = device("a2-good");
    const gone = device("a2-gone");
    const flaky = device("a2-flaky");
    await saveSubscriptionIn(a2.db, good);
    await saveSubscriptionIn(a2.db, gone);
    await saveSubscriptionIn(a2.db, flaky);
    for (const label of ["Mjölk", "Ägg", "Smör"]) await addItem(a, label);
    const seen: { endpoint: string; body: string }[] = [];
    const send: SendPush = async (target, message) => {
      seen.push({ endpoint: target.endpoint, body: message.body });
      if (target.endpoint === gone.endpoint) return "gone";
      return target.endpoint === flaky.endpoint ? "failed" : "sent";
    };
    const result = await flushPushBatchesIn(a.db, send, "Livskoll", quiet, maxWait);
    expect(result).toEqual({ sent: 1, failed: 1, dropped: 1 });
    expect(seen.map((entry) => entry.body)).toEqual(["3 nya varor på listan", "3 nya varor på listan", "3 nya varor på listan"]);
    const left = (await adminClient().from("push_subscription").select("endpoint").eq("user_id", a2.id)).data!.map((row) => row.endpoint).sort();
    expect(left).toEqual([good.endpoint, flaky.endpoint].sort());
  });

  it("removes only the household's own devices when asked to drop endpoints", async () => {
    const mine = device("a2");
    const theirs = device("b");
    await saveSubscriptionIn(a2.db, mine);
    await saveSubscriptionIn(b.db, theirs);
    expect(await dropSubscriptionsIn(a.db, [mine.endpoint, theirs.endpoint])).toBe(1);
    expect((await adminClient().from("push_subscription").select("endpoint").eq("endpoint", theirs.endpoint)).data).toHaveLength(1);
    expect((await anonClient().rpc("drop_push_subscriptions", { endpoints: [theirs.endpoint] })).error?.code).toBe("42501");
  });
});
