import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { reserveAiCallIn } from "@/features/settings/ai-meter";
import { adminClient, anonClient, createTestUser, deleteTestUsers, householdOf, moveToHousehold, type TestUser } from "./support";

// Tak för AI-kostnad per hushåll: the owner's cap (table ai_cap, closed to every client), what the
// caller's household has used today (ai_cap_status: tokens per model, summed over every member, and
// whether the household has the app's owner in it), the owner's list of all households
// (ai_cap_households) and set_ai_cap. Prices are not in the database: it only sums tokens.
// The owner here is a test user added to app_owner for this run and removed after it. The cap is
// put back to 10 kr afterwards, since the table is shared by every test.

let owner: TestUser;
let ann: TestUser;
let bo: TestUser;
let cleo: TestUser;
let annHousehold: string;
let cleoHousehold: string;
let ownerHousehold: string;

const model = "claude-haiku-5-5";
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function usage(user: TestUser, household: string, tokens: { input: number; output: number }, createdAt?: string, usedModel = model) {
  const { error } = await adminClient()
    .from("ai_usage")
    .insert({ user_id: user.id, household_id: household, model: usedModel, input_tokens: tokens.input, output_tokens: tokens.output, ...(createdAt ? { created_at: createdAt } : {}) });
  expect(error).toBeNull();
}

beforeAll(async () => {
  owner = await createTestUser("aicap-owner");
  ann = await createTestUser("aicap-ann");
  bo = await createTestUser("aicap-bo");
  cleo = await createTestUser("aicap-cleo");
  expect((await adminClient().from("app_owner").insert({ user_id: owner.id })).error).toBeNull();
  annHousehold = await householdOf(ann.id);
  cleoHousehold = await householdOf(cleo.id);
  ownerHousehold = await householdOf(owner.id);
  // Bo is in Ann's household: one cap for the two of them.
  await moveToHousehold(bo, annHousehold);
  const reset = await adminClient().from("ai_cap").update({ daily_cap_sek: 10 }).eq("id", true);
  expect(reset.error).toBeNull();
});

afterAll(async () => {
  await adminClient().from("ai_cap").update({ daily_cap_sek: 10 }).eq("id", true);
  await adminClient().from("app_owner").delete().eq("user_id", owner.id);
  await deleteTestUsers();
});

describe("ai_usage, which the cap sums", () => {
  it("cannot be changed or removed by a member, so a household cannot lower its spend", async () => {
    await usage(ann, annHousehold, { input: 1000, output: 100 });
    const before = await adminClient().from("ai_usage").select("id").eq("household_id", annHousehold);
    const update = await ann.db.from("ai_usage").update({ input_tokens: 0 }).eq("household_id", annHousehold).select("id");
    expect(update.error?.code).toBe("42501");
    const remove = await ann.db.from("ai_usage").delete().eq("household_id", annHousehold).select("id");
    expect(remove.error?.code).toBe("42501");
    const after = await adminClient().from("ai_usage").select("id").eq("household_id", annHousehold);
    expect(after.data).toHaveLength(before.data?.length ?? -1);
    // The later tests count the household's usage from nothing.
    expect((await adminClient().from("ai_usage").delete().eq("household_id", annHousehold)).error).toBeNull();
  });
});

describe("the cap and who may change it", () => {
  it("starts at 10 kr and is closed to every client", async () => {
    const { data } = await adminClient().from("ai_cap").select("daily_cap_sek").eq("id", true).single();
    expect(Number(data?.daily_cap_sek)).toBe(10);
    for (const db of [ann.db, owner.db, anonClient()]) {
      const read = await db.from("ai_cap").select("*");
      expect(read.data ?? []).toEqual([]);
      const write = await db.from("ai_cap").update({ daily_cap_sek: 999 }).eq("id", true).select();
      expect(write.data ?? []).toEqual([]);
    }
  });

  it("lets only the owner set it, and only from 0 to 1000 kr", async () => {
    for (const [who, db] of [
      ["a user", ann.db],
      ["anon", anonClient()],
    ] as const) {
      const refused = await db.rpc("set_ai_cap", { new_cap: 50 });
      expect(refused.error, who).not.toBeNull();
      expect((await db.rpc("ai_cap_households")).error, who).not.toBeNull();
    }
    expect((await ann.db.rpc("set_ai_cap", { new_cap: 50 })).error?.code).toBe("42501");
    expect((await ann.db.rpc("ai_cap_households")).error?.code).toBe("42501");

    expect((await owner.db.rpc("set_ai_cap", { new_cap: -1 })).error?.code).toBe("22023");
    expect((await owner.db.rpc("set_ai_cap", { new_cap: 1000.01 })).error?.code).toBe("22023");
    expect((await owner.db.rpc("set_ai_cap", { new_cap: null as never })).error?.code).toBe("22023");

    for (const cap of [0, 7.5, 1000]) {
      const saved = await owner.db.rpc("set_ai_cap", { new_cap: cap });
      expect(saved.error).toBeNull();
      expect(Number(saved.data)).toBe(cap);
      expect(Number((await ann.db.rpc("ai_cap_status")).data?.[0]?.cap_sek)).toBe(cap);
    }
    await owner.db.rpc("set_ai_cap", { new_cap: 10 });
  });
});

describe("ai_cap_status: the caller's household today", () => {
  it("is one row without usage, with the cap and a null model", async () => {
    const { data, error } = await cleo.db.rpc("ai_cap_status");
    expect(error).toBeNull();
    expect(data).toEqual([{ cap_sek: 10, exempt: false, model: null, input_tokens: 0, output_tokens: 0 }]);
  });

  it("sums every member of the household per model, today only, and never another household's", async () => {
    await usage(ann, annHousehold, { input: 1000, output: 100 });
    await usage(bo, annHousehold, { input: 2000, output: 200 });
    await usage(bo, annHousehold, { input: 500, output: 50 }, undefined, "qwen/local");
    // Not today: three days ago (and two months ago) are left out.
    await usage(ann, annHousehold, { input: 9_000_000, output: 9_000_000 }, daysAgo(3));
    await usage(ann, annHousehold, { input: 9_000_000, output: 9_000_000 }, daysAgo(60));
    await usage(cleo, cleoHousehold, { input: 7_000_000, output: 7_000_000 });

    for (const member of [ann, bo]) {
      const { data, error } = await member.db.rpc("ai_cap_status");
      expect(error).toBeNull();
      const byModel = Object.fromEntries((data ?? []).map((row) => [row.model, [Number(row.input_tokens), Number(row.output_tokens)]]));
      expect(byModel).toEqual({ [model]: [3000, 300], "qwen/local": [500, 50] });
      expect(data?.every((row) => row.exempt === false && Number(row.cap_sek) === 10)).toBe(true);
    }
    const other = await cleo.db.rpc("ai_cap_status");
    expect(other.data?.map((row) => [Number(row.input_tokens), Number(row.output_tokens)])).toEqual([[7_000_000, 7_000_000]]);
  });

  it("marks the household with the app's owner in it as exempt, and a member who joins it", async () => {
    expect((await owner.db.rpc("ai_cap_status")).data?.[0]?.exempt).toBe(true);
    const guest = await createTestUser("aicap-guest");
    await moveToHousehold(guest, ownerHousehold);
    expect((await guest.db.rpc("ai_cap_status")).data?.[0]?.exempt).toBe(true);
    expect((await ann.db.rpc("ai_cap_status")).data?.[0]?.exempt).toBe(false);
  });

  it("is not reachable without signing in", async () => {
    expect((await anonClient().rpc("ai_cap_status")).error).not.toBeNull();
  });
});

describe("ai_cap_households: the owner's list", () => {
  it("gives every household's tokens per model for today and the month, the cap and who is exempt", async () => {
    const { data, error } = await owner.db.rpc("ai_cap_households");
    expect(error).toBeNull();
    const rows = data ?? [];
    const ann = rows.filter((row) => row.household_id === annHousehold);
    const byModel = Object.fromEntries(ann.map((row) => [row.model, row]));
    expect(Number(byModel[model]?.day_input_tokens)).toBe(3000);
    expect(Number(byModel[model]?.day_output_tokens)).toBe(300);
    // This month holds today's rows; the row from two months ago is in neither.
    expect(Number(byModel[model]?.month_input_tokens)).toBeGreaterThanOrEqual(3000);
    expect(Number(byModel[model]?.month_input_tokens)).toBeLessThan(9_000_000 + 3001);
    expect(ann[0]?.members).toContain("Medlem");
    expect(ann.every((row) => row.exempt === false && Number(row.cap_sek) === 10)).toBe(true);
    expect(rows.find((row) => row.household_id === ownerHousehold)?.exempt).toBe(true);
    // A household without usage is there too, once, with a null model.
    const quiet = await createTestUser("aicap-quiet");
    const quietHousehold = await householdOf(quiet.id);
    const again = await owner.db.rpc("ai_cap_households");
    const mine = (again.data ?? []).filter((row) => row.household_id === quietHousehold);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ model: null, day_input_tokens: 0, month_input_tokens: 0, exempt: false });
  });
});

// Security review 2026-11-11. S-03: no client writes ai_usage; the rows are written by ai_usage_reserve
// and ai_usage_settle, in the caller's own household, as the caller. S-02: each run reserves its worst
// case first, and the household's reservations are taken one at a time, so parallel calls see each
// other: they cannot pass the cap together. The decision is the app's (prices are in code):
// reserveAiCallIn, the function getAiServiceForUser hands the AI port, run here with each user's session.
describe("reservations (S-02) and writes through the functions only (S-03)", () => {
  const sonnet = "claude-sonnet-5-5";
  /** Sonnet at 10 USD per million tokens out and 10 kr per USD: 10 000 tokens out is 1 kr. */
  const kronor = (sek: number) => ({ input: 0, output: Math.round(sek * 10_000) });
  const estimate = (sek: number) => [{ model: sonnet, inputTokens: 0, outputTokens: Math.round(sek * 10_000) }];

  async function rowsOf(household: string) {
    const { data, error } = await adminClient().from("ai_usage").select("id, user_id, model, input_tokens, output_tokens").eq("household_id", household);
    expect(error).toBeNull();
    return data ?? [];
  }

  async function freshHousehold(name: string, members = 1): Promise<{ users: TestUser[]; household: string }> {
    const first = await createTestUser(`${name}-1`);
    const household = await householdOf(first.id);
    const users = [first];
    for (let index = 2; index <= members; index += 1) {
      const user = await createTestUser(`${name}-${index}`);
      await moveToHousehold(user, household);
      users.push(user);
    }
    return { users, household };
  }

  it("refuses every client's insert into ai_usage: as itself, for another household, and with 0 tokens (S-03)", async () => {
    const before = await rowsOf(annHousehold);
    const rows: { model: string; input_tokens: number; output_tokens: number; household_id?: string; user_id?: string }[] = [
      { model, input_tokens: 0, output_tokens: 0 },
      { model, input_tokens: 0, output_tokens: 0, household_id: cleoHousehold },
      { model, input_tokens: 0, output_tokens: 0, user_id: cleo.id, household_id: cleoHousehold },
    ];
    for (const row of rows) {
      expect((await ann.db.from("ai_usage").insert(row)).error?.code).toBe("42501");
      expect((await anonClient().from("ai_usage").insert(row)).error?.code).toBe("42501");
    }
    expect(await rowsOf(annHousehold)).toEqual(before);
  });

  it("keeps the reservations closed to every client", async () => {
    for (const db of [ann.db, owner.db, anonClient()]) {
      const read = await db.from("ai_usage_reservation").select("*");
      expect(read.error ? [] : read.data).toEqual([]);
      const write = await db.from("ai_usage_reservation").insert({ usage_id: randomUUID(), reservation_id: randomUUID() });
      expect(write.error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("ai_usage_reserve", { usage: [{ model, input_tokens: 1, output_tokens: 1 }] })).error?.code).toBe("42501");
    expect((await anonClient().rpc("ai_usage_settle", { reservation: randomUUID(), usage: [] })).error?.code).toBe("42501");
    expect((await anonClient().rpc("ai_cap_exempt")).error?.code).toBe("42501");
  });

  it("answers whether the caller's household is exempt, without summing", async () => {
    expect((await owner.db.rpc("ai_cap_exempt")).data).toBe(true);
    expect((await ann.db.rpc("ai_cap_exempt")).data).toBe(false);
  });

  it("writes placeholders in the caller's household as the caller, answers the day before them, and settles them once", async () => {
    const { users: [dana, erik], household } = await freshHousehold("aicap-dana", 2);
    const first = await dana!.db.rpc("ai_usage_reserve", { usage: [{ model, input_tokens: 1000, output_tokens: 100 }] });
    expect(first.error).toBeNull();
    expect(first.data).toMatchObject({ cap_sek: 10, exempt: false, too_many: false, usage: [] });
    const reservation = (first.data as { reservation: string }).reservation;
    expect(await rowsOf(household)).toMatchObject([{ user_id: dana!.id, model, input_tokens: 1000, output_tokens: 100 }]);

    // Erik in the same household sees Dana's open reservation in the day.
    const second = await erik!.db.rpc("ai_usage_reserve", { usage: [{ model, input_tokens: 5, output_tokens: 5 }] });
    expect((second.data as { usage: unknown }).usage).toEqual([{ model, input_tokens: 1000, output_tokens: 100 }]);

    // Only Dana settles her reservation: not Erik, not another household.
    for (const db of [erik!.db, cleo.db]) {
      expect((await db.rpc("ai_usage_settle", { reservation, usage: [] })).data).toBe(false);
    }
    expect((await rowsOf(household)).filter((row) => row.user_id === dana!.id)).toHaveLength(1);
    const settled = await dana!.db.rpc("ai_usage_settle", {
      reservation,
      usage: [
        { model, input_tokens: 700, output_tokens: 70 },
        { model: "web-search", input_tokens: 2, output_tokens: 0 },
      ],
    });
    expect(settled.data).toBe(true);
    const mine = (await rowsOf(household))
      .filter((row) => row.user_id === dana!.id)
      .map((row) => ({ model: row.model, input_tokens: row.input_tokens, output_tokens: row.output_tokens }));
    expect(mine.sort((x, y) => x.model.localeCompare(y.model))).toEqual([
      { model, input_tokens: 700, output_tokens: 70 },
      { model: "web-search", input_tokens: 2, output_tokens: 0 },
    ]);
    // Once only.
    expect((await dana!.db.rpc("ai_usage_settle", { reservation, usage: [{ model, input_tokens: 0, output_tokens: 0 }] })).data).toBe(false);
    expect((await rowsOf(household)).filter((row) => row.user_id === dana!.id)).toHaveLength(2);
    // An empty settlement releases a reservation: its placeholders go.
    const released = (second.data as { reservation: string }).reservation;
    expect((await erik!.db.rpc("ai_usage_settle", { reservation: released, usage: [] })).data).toBe(true);
    expect((await rowsOf(household)).filter((row) => row.user_id === erik!.id)).toEqual([]);
  });

  it("never touches another household: the rows go to the caller's, and another's day is unchanged", async () => {
    const { users: [fia], household } = await freshHousehold("aicap-fia");
    const cleoBefore = await rowsOf(cleoHousehold);
    expect((await fia!.db.rpc("ai_usage_reserve", { usage: [{ model, input_tokens: 10, output_tokens: 10 }] })).error).toBeNull();
    // The function takes no household: a household_id or user_id in a row is not read.
    const spoof = await fia!.db.rpc("ai_usage_reserve", {
      usage: [{ model, input_tokens: 10, output_tokens: 10, household_id: cleoHousehold, user_id: cleo.id }],
    });
    expect(spoof.error).toBeNull();
    const rows = await rowsOf(household);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.user_id === fia!.id)).toBe(true);
    expect(await rowsOf(cleoHousehold)).toEqual(cleoBefore);
    expect((await cleo.db.rpc("ai_cap_status")).data?.map((row) => Number(row.output_tokens))).toEqual([7_000_000]);
  });

  it("refuses rows that are not usage", async () => {
    const bad = [
      [],
      [{ model: "", input_tokens: 1, output_tokens: 1 }],
      [{ model, input_tokens: -1, output_tokens: 1 }],
      [{ model, input_tokens: 1.5, output_tokens: 1 }],
      [{ model, input_tokens: "1", output_tokens: 1 }],
      [{ model, output_tokens: 1 }],
      Array.from({ length: 6 }, () => ({ model, input_tokens: 1, output_tokens: 1 })),
      { model, input_tokens: 1, output_tokens: 1 },
    ];
    for (const rows of bad) expect((await ann.db.rpc("ai_usage_reserve", { usage: rows })).error?.code, JSON.stringify(rows)).toBe("22023");
  });

  it("lets no more parallel calls through than the cap allows, counting every member's (S-02)", async () => {
    const { users, household } = await freshHousehold("aicap-para", 2);
    // 9,99 kr used today: one call may still start, and only one.
    await usage(users[0]!, household, kronor(9.99), undefined, sonnet);
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => reserveAiCallIn(users[index % 2]!.db, estimate(0.5))));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok).every((result) => !result.ok && result.code === "ai_cap_reached")).toBe(true);
    // The refused calls' placeholders are gone: the seed row and the one call's reservation are left.
    expect(await rowsOf(household)).toHaveLength(2);
  });

  it("lets calls through until the open reservations reach the cap, and none after", async () => {
    const { users, household } = await freshHousehold("aicap-five", 2);
    await usage(users[0]!, household, kronor(5), undefined, sonnet);
    // Each call may cost 1 kr: at 5, 6, 7, 8 and 9 kr a call starts under the cap; at 10 kr none does.
    const results = await Promise.all(Array.from({ length: 10 }, (_, index) => reserveAiCallIn(users[index % 2]!.db, estimate(1))));
    expect(results.filter((result) => result.ok)).toHaveLength(5);
    expect(await rowsOf(household)).toHaveLength(6);
    // The gate sees the open reservations too: the household is at its cap.
    const status = await users[0]!.db.rpc("ai_cap_status");
    expect(status.data?.reduce((sum, row) => sum + Number(row.output_tokens), 0)).toBe(100_000);
    // Settling at what the calls really used opens the cap again.
    for (const result of results) if (result.ok) await result.hold.settle([{ model: sonnet, inputTokens: 0, outputTokens: 1000 }]);
    expect((await reserveAiCallIn(users[1]!.db, estimate(1))).ok).toBe(true);
  });

  it("lets every parallel call of the exempt household through", async () => {
    await usage(owner, ownerHousehold, kronor(50), undefined, sonnet);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveAiCallIn(owner.db, estimate(5))));
    expect(results.every((result) => result.ok)).toBe(true);
    for (const result of results) if (result.ok) await result.hold.settle([]);
  });

  it("bounds the rows a household that is not exempt can make in a day, so a member cannot fill the sum", async () => {
    const { users: [gus], household } = await freshHousehold("aicap-gus");
    const rows = Array.from({ length: 2000 }, () => ({ user_id: gus!.id, household_id: household, model: "mock", input_tokens: 0, output_tokens: 0 }));
    expect((await adminClient().from("ai_usage").insert(rows)).error).toBeNull();
    const refused = await gus!.db.rpc("ai_usage_reserve", { usage: [{ model: "mock", input_tokens: 0, output_tokens: 0 }] });
    expect(refused.data).toMatchObject({ reservation: null, too_many: true });
    expect(await reserveAiCallIn(gus!.db, estimate(0.01))).toEqual({ ok: false, code: "ai_cap_reached" });
    // Counted, as a read gives at most 1000 rows.
    const { count } = await adminClient().from("ai_usage").select("id", { count: "exact", head: true }).eq("household_id", household);
    expect(count).toBe(2000);
    expect((await adminClient().from("ai_usage").delete().eq("household_id", household)).error).toBeNull();
  });
});
