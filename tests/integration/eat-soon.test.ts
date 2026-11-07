import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savePreferencesIn, saveSubscriptionIn } from "@/features/push/data/push";
import { sendEatSoonIn, type SendPush } from "@/lib/push-send";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// "Ät snart": the catalog gives every ingredient its shelf life when it is created (ingredient_keeps_days, a
// before-insert trigger), and the daily push goes to the household's devices that want it (eat_soon_devices).

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;

const device = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${randomUUID()}`, p256dh: "key", auth: "secret" });
const choices = { lista: true, forrad: false, matsedel: false, lappar: true };

beforeAll(async () => {
  a = await createTestUser("eatsoon-a");
  a2 = await createTestUser("eatsoon-a2");
  b = await createTestUser("eatsoon-b");
  householdA = await householdOf(a.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  await deleteTestUsers();
});

beforeEach(async () => {
  await adminClient().from("push_subscription").delete().in("user_id", [a.id, a2.id, b.id]);
  await adminClient().from("push_preference").delete().in("user_id", [a.id, a2.id, b.id]);
});

describe("keeps_days", () => {
  it.each([
    ["köttfärs", 2],
    ["crème fraiche", 5],
    ["mjölk", 7],
    ["yoghurt", 10],
    ["hårdost", 30],
    ["ägg", 28],
    ["sallad", 4],
    ["rökt lax", 5],
  ])("gives a new ingredient %s its shelf life", async (name, days) => {
    const made = await a.db
      .from("ingredient")
      .insert({ name: name[0].toLocaleUpperCase("sv-SE") + name.slice(1), normalized_name: name, section: "Mejeri", location: "Kyl" })
      .select("keeps_days")
      .single();
    expect(made.error).toBeNull();
    expect(made.data?.keeps_days).toBe(days);
  });

  it("leaves an ingredient without a rule empty, keeps a value given on insert, and refuses zero", async () => {
    const plain = await a.db.from("ingredient").insert({ name: "Salt", normalized_name: `salt${randomUUID().slice(0, 6)}`, section: "Skafferi", location: "Skafferi" }).select("keeps_days").single();
    expect(plain.error).toBeNull();
    expect(plain.data?.keeps_days).toBeNull();
    const own = await a.db.from("ingredient").insert({ name: "Egen", normalized_name: `egen${randomUUID().slice(0, 6)}`, section: "Övrigt", location: "Kyl", keeps_days: 3 }).select("keeps_days").single();
    expect(own.data?.keeps_days).toBe(3);
    const zero = await a.db.from("ingredient").insert({ name: "Noll", normalized_name: `noll${randomUUID().slice(0, 6)}`, section: "Övrigt", location: "Kyl", keeps_days: 0 });
    expect(zero.error?.code).toBe("23514");
  });
});

describe("eat_soon_devices and sendEatSoonIn", () => {
  it("lists the household's devices, not those of members who turned Ät snart off or of other households", async () => {
    const mine = device("a");
    const other = device("a2");
    const theirs = device("b");
    await saveSubscriptionIn(a.db, mine);
    await saveSubscriptionIn(a2.db, other);
    await saveSubscriptionIn(b.db, theirs);
    const all = await a.db.rpc("eat_soon_devices");
    expect(all.data!.map((row) => row.endpoint).sort()).toEqual([mine.endpoint, other.endpoint].sort());
    await savePreferencesIn(a2.db, { ...choices, atsnart: false });
    const fewer = await a.db.rpc("eat_soon_devices");
    expect(fewer.data!.map((row) => row.endpoint)).toEqual([mine.endpoint]);
    expect((await anonClient().rpc("eat_soon_devices")).error?.code).toBe("42501");
  });

  it("sends one notification per device with the names, nothing for nothing due, and drops refused devices", async () => {
    const good = device("a-good");
    const gone = device("a2-gone");
    await saveSubscriptionIn(a.db, good);
    await saveSubscriptionIn(a2.db, gone);
    const seen: string[] = [];
    const send: SendPush = async (target, message) => {
      seen.push(message.body);
      return target.endpoint === gone.endpoint ? "gone" : "sent";
    };
    expect(await sendEatSoonIn(a.db, [], send, "Livskoll")).toEqual({ devices: 0, sent: 0, failed: 0, dropped: 0 });
    expect(seen).toEqual([]);
    const result = await sendEatSoonIn(a.db, ["Köttfärs"], send, "Livskoll");
    expect(result).toEqual({ devices: 2, sent: 1, failed: 0, dropped: 1 });
    expect(seen).toEqual(["Köttfärs bör användas idag", "Köttfärs bör användas idag"]);
    expect((await adminClient().from("push_subscription").select("endpoint").eq("endpoint", gone.endpoint)).data).toHaveLength(0);
  });
});
