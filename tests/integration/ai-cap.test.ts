import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
