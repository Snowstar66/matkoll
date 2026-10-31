import { describe, expect, it, vi } from "vitest";
import { toSnapshot } from "@/features/pantry";
import { fail, ok } from "@/lib/errors";
import { customLineKey, recipeLineKey, textLineKey } from "../domain/line-key";
import { ShoppingDataError, type ShoppingDb } from "./client";
import { clearPutInPantryIn, putInPantryWith, receiptedChecks, type PutInPantryDeps } from "./put-in-pantry";

// The "Lägg till i Matvaror" flow with its sources and writes stubbed: what goes to
// the pantry, what is cleared, in which order, and how each failure ends.
// The flow against real tables is in tests/integration/shopping.test.ts.

const planId = "99999999-9999-4999-8999-999999999999";
const recipeId = "88888888-8888-4888-8888-888888888888";
const gradde = "11111111-1111-4111-8111-111111111111";
const salt = "22222222-2222-4222-8222-222222222222";
const kaffe = "33333333-3333-4333-8333-333333333333";
const kaffeItem = "55555555-5555-4555-8555-555555555555";
const diskItem = "66666666-6666-4666-8666-666666666666";
const check1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const check2 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const check3 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const check4 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const check5 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";

const graddeKey = recipeLineKey(gradde, "dl");
const saltKey = recipeLineKey(salt, null);
const textKey = textLineKey("En näve persilja");

/** A plan with a dish needing 3 dl grädde, salt to taste and a text line; kaffe and diskmedel as own items. */
function deps(change: Partial<PutInPantryDeps> = {}, checks = [
  { id: check1, key: graddeKey },
  { id: check2, key: saltKey },
  { id: check3, key: textKey },
  { id: check4, key: customLineKey(kaffeItem) },
  { id: check5, key: customLineKey(diskItem) },
]) {
  const calls: string[] = [];
  const base: PutInPantryDeps = {
    sources: {
      currentPlan: async () => ({
        id: planId,
        name: "Vecka 44",
        recipes: [{ id: "d1", recipeId, recipeTitle: "Gryta", servings: 4, position: 0 }],
      }),
      recipesByIds: async () => [
        {
          id: recipeId,
          originalServings: 4,
          lines: [
            { ingredientId: gradde, amount: 3, unit: "dl", isVague: false, originalText: "3 dl grädde" },
            { ingredientId: salt, amount: null, unit: null, isVague: true, originalText: "salt" },
            { ingredientId: null, amount: null, unit: null, isVague: true, originalText: "En näve persilja" },
          ],
        },
      ],
      pantry: async () => toSnapshot([]),
      ingredientNames: async () => ({ [gradde]: "Grädde", [salt]: "Salt", [kaffe]: "Kaffe" }),
      // All under Övrigt, so the list is in name order; the catalog knows every ingredient.
      ingredientDefaults: async (ids) =>
        Object.fromEntries(ids.map((id) => [id, { section: "Övrigt" as const, location: "Kyl" as const, defaultUnit: null }])),
      customItems: async () => [
        { id: kaffeItem, label: "kaffe", ingredientId: kaffe, amount: 2, unit: "förp" },
        { id: diskItem, label: "diskmedel", ingredientId: null, amount: null, unit: null },
      ],
      overrides: async () => [],
    },
    checkRows: async () => checks,
    findAdditions: vi.fn(async () => []),
    addToPantry: vi.fn(async () => {
      calls.push("pantry");
      return ok({ added: 3 });
    }),
    clear: vi.fn(async () => {
      calls.push("clear");
      return 2;
    }),
    forgetAdditions: vi.fn(async () => {
      calls.push("forget");
    }),
  };
  return { deps: { ...base, ...change }, calls };
}

const failingClear = () => Promise.reject(new ShoppingDataError("clear_failed 08006", "08006"));

describe("putInPantryWith", () => {
  it("puts the checked lines in the pantry, then clears them by check id, forgets the receipts, and says how many", async () => {
    const { deps: d, calls } = deps();
    expect(await putInPantryWith(d, planId)).toEqual({
      kind: "done",
      added: 3,
      removed: 1,
      skipped: 0,
      pantryWritten: true,
      handled: 3,
      // Story 16.18: each item with its name and the place it went to.
      placed: [
        { key: check1, ingredientId: gradde, amount: 3, unit: "dl", name: "Grädde", location: "Kyl" },
        { key: check4, ingredientId: kaffe, amount: 2, unit: "förp", name: "kaffe", location: "Kyl" },
        { key: check2, ingredientId: salt, amount: null, unit: null, name: "Salt", location: "Kyl" },
      ],
    });
    expect(d.addToPantry).toHaveBeenCalledWith([
      { key: check1, ingredientId: gradde, amount: 3, unit: "dl" },
      { key: check4, ingredientId: kaffe, amount: 2, unit: "förp" },
      { key: check2, ingredientId: salt, amount: null, unit: null },
    ]);
    // The list's order: by name within Övrigt. The text line keeps its check.
    expect(d.clear).toHaveBeenCalledWith(planId, {
      checkIds: [check5, check1, check4, check2],
      overrideKeys: [graddeKey, saltKey],
      customItemIds: [diskItem, kaffeItem],
    });
    expect(d.forgetAdditions).toHaveBeenCalledWith([check5, check1, check4, check2]);
    expect(calls).toEqual(["pantry", "clear", "forget"]);
    expect(d.findAdditions).not.toHaveBeenCalled();
  });

  it("only clears when no checked line has a catalog ingredient", async () => {
    const { deps: d } = deps({}, [{ id: check5, key: customLineKey(diskItem) }]);
    expect(await putInPantryWith(d, planId)).toEqual({ kind: "done", added: 0, removed: 1, skipped: 0, pantryWritten: false, handled: 0, placed: [] });
    expect(d.addToPantry).not.toHaveBeenCalled();
    expect(d.clear).toHaveBeenCalledWith(planId, { checkIds: [check5], overrideKeys: [], customItemIds: [diskItem] });
  });

  it("does nothing without a check, or with only a text line checked", async () => {
    for (const checks of [[], [{ id: check3, key: textKey }]]) {
      const { deps: d } = deps({}, checks);
      expect(await putInPantryWith(d, planId)).toEqual({ kind: "done", added: 0, removed: 0, skipped: 0, pantryWritten: false, handled: 0, placed: [] });
      expect(d.addToPantry).not.toHaveBeenCalled();
      expect(d.clear).not.toHaveBeenCalled();
    }
  });

  it("skips a line whose ingredient the catalog does not know, keeping its check, and sends the rest", async () => {
    const { deps: d } = deps();
    const withoutSalt = deps({
      sources: {
        ...d.sources,
        ingredientDefaults: async (ids) =>
          Object.fromEntries(
            ids.filter((id) => id !== salt).map((id) => [id, { section: "Övrigt" as const, location: "Kyl" as const, defaultUnit: null }]),
          ),
      },
    }).deps;
    expect(await putInPantryWith(withoutSalt, planId)).toMatchObject({ kind: "done", added: 2, skipped: 1 });
    expect(withoutSalt.clear).toHaveBeenCalledWith(planId, expect.objectContaining({ checkIds: [check5, check1, check4] }));
  });

  it("also clears the check of a line no longer listed when an earlier run put it in the pantry, but not its override", async () => {
    const covered = { id: check2, key: recipeLineKey(gradde, "st") };
    const { deps: d } = deps({ findAdditions: vi.fn(async () => [check2]) }, [{ id: check1, key: graddeKey }, covered]);
    await putInPantryWith(d, planId);
    expect(d.findAdditions).toHaveBeenCalledWith([check2]);
    expect(d.clear).toHaveBeenCalledWith(planId, { checkIds: [check1, check2], overrideKeys: [graddeKey], customItemIds: [] });
  });

  it("leaves a check whose line is gone when the pantry has no receipt of it", async () => {
    const covered = { id: check2, key: recipeLineKey(gradde, "st") };
    const { deps: d } = deps({}, [covered]);
    expect(await putInPantryWith(d, planId)).toEqual({ kind: "done", added: 0, removed: 0, skipped: 0, pantryWritten: false, handled: 0, placed: [] });
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("writes nothing for another plan than the current one", async () => {
    const { deps: d } = deps();
    expect(await putInPantryWith(d, "77777777-7777-4777-8777-777777777777")).toEqual({
      kind: "plan_changed",
      pantryWritten: false,
    });
    const none = deps({ sources: { ...d.sources, currentPlan: async () => null } });
    expect(await putInPantryWith(none.deps, planId)).toEqual({ kind: "plan_changed", pantryWritten: false });
    expect(d.addToPantry).not.toHaveBeenCalled();
  });

  it("clears nothing when the pantry fails, and keeps the checks", async () => {
    const { deps: d } = deps({ addToPantry: vi.fn(async () => fail("pantry_add_failed")) });
    expect(await putInPantryWith(d, planId)).toEqual({ kind: "pantry_failed", error: fail("pantry_add_failed").error });
    expect(d.clear).not.toHaveBeenCalled();
  });

  it("passes on pantry_site_gone, clearing nothing and keeping the checks", async () => {
    const { deps: d } = deps({ addToPantry: vi.fn(async () => fail("pantry_site_gone")) });
    expect(await putInPantryWith(d, planId)).toEqual({ kind: "pantry_failed", error: fail("pantry_site_gone").error });
    expect(d.clear).not.toHaveBeenCalled();
    expect(d.forgetAdditions).not.toHaveBeenCalled();
  });

  it("counts the list against the pantry it is given: a line covered there is not sent", async () => {
    // The list's place has the grädde; another place's would not change this.
    const { deps: base } = deps();
    const { deps: d } = deps({
      sources: { ...base.sources, pantry: async () => toSnapshot([{ ingredientId: gradde, amount: 3, unit: "dl" }]) },
    });
    await putInPantryWith(d, planId);
    expect(d.addToPantry).toHaveBeenCalledWith([
      { key: check4, ingredientId: kaffe, amount: 2, unit: "förp" },
      { key: check2, ingredientId: salt, amount: null, unit: null },
    ]);
  });

  it("never sends an item twice on a second run against another place's pantry: a covered line's receipt clears its check", async () => {
    // The first run put everything in the pantry of one place but got no
    // answer; the second counts against another place, which has the grädde.
    const { deps: base } = deps();
    const { deps: d } = deps({
      sources: { ...base.sources, pantry: async () => toSnapshot([{ ingredientId: gradde, amount: 3, unit: "dl" }]) },
      findAdditions: vi.fn(async () => [check1]),
    });
    await putInPantryWith(d, planId);
    // The grädde is not sent again; its check is cleared with its receipt.
    expect(d.addToPantry).toHaveBeenCalledWith([
      { key: check4, ingredientId: kaffe, amount: 2, unit: "förp" },
      { key: check2, ingredientId: salt, amount: null, unit: null },
    ]);
    expect(d.clear).toHaveBeenCalledWith(planId, expect.objectContaining({ checkIds: [check5, check4, check2, check1] }));
    // The rest keep their keys, the checks' ids, so the pantry skips those it has a receipt of.
  });

  it("says how many items the pantry took in this run, without those it skipped for a receipt", async () => {
    const { deps: d } = deps({ addToPantry: vi.fn(async () => ok({ added: 0 })) });
    expect(await putInPantryWith(d, planId)).toMatchObject({ kind: "done", added: 3, handled: 0, pantryWritten: true });
  });

  it("tries a failed clear once more", async () => {
    const clear = vi.fn().mockImplementationOnce(failingClear).mockResolvedValueOnce(2);
    const { deps: d } = deps({ clear });
    expect(await putInPantryWith(d, planId)).toMatchObject({ kind: "done", added: 3 });
    expect(clear).toHaveBeenCalledTimes(2);
    expect(d.forgetAdditions).toHaveBeenCalled();
  });

  it("says the pantry was written when the clearing fails twice, or the plan changed meanwhile, and forgets nothing", async () => {
    const failing = deps({ clear: vi.fn(failingClear) });
    expect(await putInPantryWith(failing.deps, planId)).toEqual({
      kind: "clear_failed",
      detail: "clear_failed 08006",
      pantryWritten: true,
    });
    expect(failing.deps.clear).toHaveBeenCalledTimes(2);
    expect(failing.deps.forgetAdditions).not.toHaveBeenCalled();
    const switched = deps({ clear: vi.fn(async () => "plan_changed" as const) });
    expect(await putInPantryWith(switched.deps, planId)).toEqual({ kind: "plan_changed", pantryWritten: true });
    expect(switched.deps.forgetAdditions).not.toHaveBeenCalled();
  });

  it("passes on what the sources throw, before writing", async () => {
    const { deps: d } = deps({ checkRows: async () => Promise.reject(new ShoppingDataError("list_checks_failed 08006")) });
    await expect(putInPantryWith(d, planId)).rejects.toThrow(ShoppingDataError);
    expect(d.addToPantry).not.toHaveBeenCalled();
  });
});

describe("receiptedChecks", () => {
  it("gives the unsent checks the pantry has a receipt of, asking nothing without any", async () => {
    const findAdditions = vi.fn(async () => [check2]);
    expect(await receiptedChecks([], findAdditions)).toEqual([]);
    expect(findAdditions).not.toHaveBeenCalled();
    expect(
      await receiptedChecks(
        [
          { id: check1, key: graddeKey },
          { id: check2, key: saltKey },
        ],
        findAdditions,
      ),
    ).toEqual([{ id: check2, key: saltKey }]);
  });
});

describe("clearPutInPantryIn", () => {
  function fakeRpc(answer: { data: unknown; error: { code: string } | null }) {
    const rpc = vi.fn(async () => answer);
    return { db: { rpc } as unknown as ShoppingDb, rpc };
  }
  const clearing = (
    change: Partial<{ checkIds: readonly string[]; overrideKeys: readonly string[]; customItemIds: readonly string[] }> = {},
  ) => ({
    checkIds: [check1],
    overrideKeys: [graddeKey],
    customItemIds: [],
    ...change,
  });

  it("clears once per id and key, and returns the own items deleted", async () => {
    const { db, rpc } = fakeRpc({ data: 1, error: null });
    expect(
      await clearPutInPantryIn(db, planId, {
        checkIds: [check1, check1, check3],
        overrideKeys: [graddeKey, graddeKey],
        customItemIds: [diskItem],
      }),
    ).toBe(1);
    expect(rpc).toHaveBeenCalledWith("clear_put_in_pantry", {
      plan_id: planId,
      check_ids: [check1, check3],
      override_keys: [graddeKey],
      custom_item_ids: [diskItem],
    });
  });

  it("gives plan_changed for 55000, and throws for other refusals and invalid input", async () => {
    expect(await clearPutInPantryIn(fakeRpc({ data: null, error: { code: "55000" } }).db, planId, clearing())).toBe(
      "plan_changed",
    );
    await expect(
      clearPutInPantryIn(fakeRpc({ data: null, error: { code: "08006" } }).db, planId, clearing()),
    ).rejects.toThrow(new ShoppingDataError("clear_failed 08006", "08006"));
    const { db, rpc } = fakeRpc({ data: 0, error: null });
    for (const [plan, change] of [
      ["plan", {}],
      [planId, { checkIds: ["check"] }],
      [planId, { overrideKeys: ["r:inte-ett-id:dl"] }],
      [planId, { customItemIds: ["kaffe"] }],
    ] as const) {
      await expect(clearPutInPantryIn(db, plan, clearing(change))).rejects.toThrow(new ShoppingDataError("invalid_clear"));
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
