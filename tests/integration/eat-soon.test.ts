import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { savePreferencesIn, saveSubscriptionIn } from "@/features/push/data/push";
import { sendEatSoonIn, type SendPush } from "@/lib/push-send";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, localSql, moveToHousehold, type TestUser } from "./support";

// "Ät snart": the catalog gives every ingredient its shelf life when it is created (ingredient_keeps_days, a
// before-insert trigger), and the daily push goes to the household's devices that want it (eat_soon_devices).

let a: TestUser;
let a2: TestUser;
let b: TestUser;
let householdA: string;
let householdB: string;

const device = (name: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}-${randomUUID()}`, p256dh: "key", auth: "secret" });
const choices = { lista: true, forrad: false, matsedel: false, lappar: true };

/** The days a household was told are for the database's own function only: not even the service role reads them. */
function clearDays() {
  localSql(`with gone as (delete from public.eat_soon_sent where household_id in ('${householdA}', '${householdB}') returning 1) select count(*) from gone`);
}

beforeAll(async () => {
  a = await createTestUser("eatsoon-a");
  a2 = await createTestUser("eatsoon-a2");
  b = await createTestUser("eatsoon-b");
  householdA = await householdOf(a.id);
  householdB = await householdOf(b.id);
  await moveToHousehold(a2, householdA);
});

afterAll(async () => {
  await adminClient().from("household").delete().eq("id", householdA);
  clearDays();
  await deleteTestUsers();
});

beforeEach(async () => {
  await adminClient().from("push_subscription").delete().in("user_id", [a.id, a2.id, b.id]);
  await adminClient().from("push_preference").delete().in("user_id", [a.id, a2.id, b.id]);
});

describe("keeps_days", () => {
  it.each([
    ["köttfärs", 1],
    ["kycklingfilé", 1],
    ["färska bär", null],
    ["fisksås", null],
    ["kycklingfond", null],
    ["nötbuljong", null],
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

describe("claim_eat_soon_devices and sendEatSoonIn", () => {
  beforeEach(async () => {
    clearDays();
  });

  it("gives the household's devices once a day, only to members who want it", async () => {
    const mine = device("a");
    const other = device("a2");
    const theirs = device("b");
    await saveSubscriptionIn(a.db, mine);
    await saveSubscriptionIn(a2.db, other);
    await saveSubscriptionIn(b.db, theirs);
    await savePreferencesIn(a2.db, { ...choices, atsnart: false });
    const first = await a.db.rpc("claim_eat_soon_devices");
    expect(first.error).toBeNull();
    expect(first.data!.map((row) => row.endpoint)).toEqual([mine.endpoint]);
    // The same day again, by anyone in the household: nothing.
    expect((await a.db.rpc("claim_eat_soon_devices")).data).toEqual([]);
    expect((await a2.db.rpc("claim_eat_soon_devices")).data).toEqual([]);
    // Another household is not affected.
    const others = await b.db.rpc("claim_eat_soon_devices");
    expect(others.data!.map((row) => row.endpoint)).toEqual([theirs.endpoint]);
    expect((await anonClient().rpc("claim_eat_soon_devices")).error?.code).toBe("42501");
    // Nobody reads or writes the days through the API.
    expect((await a.db.from("eat_soon_sent").select("day")).error?.code).toBe("42501");
  });

  it("claims again on the next day and clears old rows", async () => {
    await saveSubscriptionIn(a.db, device("a"));
    localSql(`with added as (insert into public.eat_soon_sent (household_id, day) values ('${householdA}', '2020-01-01'), ('${householdA}', '2020-01-02') returning 1) select count(*) from added`);
    expect((await a.db.rpc("claim_eat_soon_devices")).data).toHaveLength(1);
    expect(localSql(`select day from public.eat_soon_sent where household_id = '${householdA}'`)).toHaveLength(1);
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
    // Nothing due: nothing is sent and the day is not used up.
    expect(await sendEatSoonIn(a.db, [], send, "Livskoll")).toEqual({ devices: 0, sent: 0, failed: 0, dropped: 0 });
    expect(seen).toEqual([]);
    const result = await sendEatSoonIn(a.db, [{ name: "Köttfärs", today: true }], send, "Livskoll");
    expect(result).toEqual({ devices: 2, sent: 1, failed: 0, dropped: 1 });
    expect(seen).toEqual(["Köttfärs bör användas idag", "Köttfärs bör användas idag"]);
    expect((await adminClient().from("push_subscription").select("endpoint").eq("endpoint", gone.endpoint)).data).toHaveLength(0);
    // The second call the same day sends nothing.
    expect(await sendEatSoonIn(a.db, [{ name: "Köttfärs", today: true }], send, "Livskoll")).toEqual({ devices: 0, sent: 0, failed: 0, dropped: 0 });
    expect(seen).toHaveLength(2);
  });
});
