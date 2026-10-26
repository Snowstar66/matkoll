import { beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok } from "@/lib/errors";
import { PantryDataError } from "../data/client";
import type { ConfirmItemInput, InventoryConfirmInput } from "../domain/pantry-suggestion";

// confirmPantryInventory (Story 6.4) with the user check, the session
// client, the catalog, the write and revalidation stubbed.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/catalog/server")>()),
  commitIngredients: (...args: unknown[]) => commitIngredients(...args),
}));
const applyPantryInventoryIn = vi.fn();
vi.mock("../data/inventory", () => ({ applyPantryInventoryIn: (...args: unknown[]) => applyPantryInventoryIn(...args) }));

const { confirmPantryInventory } = await import("./confirm-pantry-inventory");

const mjolk = "11111111-1111-4111-8111-111111111111";
const agg = "33333333-3333-4333-8333-333333333333";
const yoghurt = "11111111-1111-4111-8111-111111111112";
const rowId = "22222222-2222-4222-8222-222222222222";
const otherRowId = "22222222-2222-4222-8222-222222222223";
const operation = "44444444-4444-4444-8444-444444444444";

const existing = (ingredientId: string, change: Partial<ConfirmItemInput> = {}): ConfirmItemInput => ({
  ingredient: { kind: "existing", ingredientId },
  location: "Kyl",
  amount: 1,
  unit: "förp",
  ...change,
});
const fresh = (name: string, change: Partial<ConfirmItemInput> = {}): ConfirmItemInput => ({
  ingredient: { kind: "new", proposalId: "n1", name, section: "Mejeri", location: "Kyl", defaultUnit: "st" },
  location: "Kyl",
  amount: 6,
  unit: "st",
  ...change,
});
/** The photo's place (Story 8.4). */
const stugan = "55555555-5555-4555-8555-555555555555";
const input = (change: Partial<InventoryConfirmInput> = {}): InventoryConfirmInput => ({
  siteId: stugan,
  location: "Kyl",
  items: [existing(mjolk), fresh("ägg")],
  replaceRowIds: [otherRowId],
  removeRowIds: [rowId],
  operationId: operation,
  ...change,
});
const removedRow = { id: rowId, ingredientId: yoghurt, location: "Kyl", amount: 2, unit: "förp" };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  commitIngredients
    .mockReset()
    .mockImplementation(async (choices: { ingredient: { kind: string; ingredientId?: string } }[]) =>
      choices.map(({ ingredient }) => (ingredient.kind === "new" ? agg : ingredient.ingredientId!)),
    );
  applyPantryInventoryIn
    .mockReset()
    .mockImplementation(async (_db, request: { items: { ingredientId: string }[]; removeRowIds: string[] }) => ({
      set: request.items.map((item, index) => ({ id: `row-${index}`, ...item })),
      removed: request.removeRowIds.length > 0 ? [removedRow] : [],
      removedCount: request.removeRowIds.length > 0 ? 1 : 0,
      replaced: 1,
      undoable: request.removeRowIds.length > 0 ? 1 : 0,
      unreadable: false,
    }));
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("confirmPantryInventory", () => {
  it("commits the ingredients, then replaces, removes and sets in one write, and revalidates", async () => {
    const result = await confirmPantryInventory(input());
    expect(result).toEqual(
      ok({ set: 2, removed: [removedRow], removedCount: 1, undoable: 1, setIngredientIds: [mjolk, agg], operationId: operation }),
    );
    expect(commitIngredients).toHaveBeenCalledWith([
      { text: "", ingredient: { kind: "match", ingredientId: mjolk, confidence: "exact" } },
      {
        text: "ägg",
        ingredient: { kind: "new", proposal: { name: "ägg", section: "Mejeri", location: "Kyl", defaultUnit: "st" } },
      },
    ]);
    expect(applyPantryInventoryIn).toHaveBeenCalledWith(db, {
      place: "Kyl",
      items: [
        { ingredientId: mjolk, location: "Kyl", amount: 1, unit: "förp" },
        { ingredientId: agg, location: "Kyl", amount: 6, unit: "st" },
      ],
      replaceRowIds: [otherRowId],
      removeRowIds: [rowId],
      operationId: operation,
      siteId: stugan,
    });
    expect(applyPantryInventoryIn.mock.invocationCallOrder[0]).toBeGreaterThan(commitIngredients.mock.invocationCallOrder[0]);
    expect(revalidateFor).toHaveBeenCalledExactlyOnceWith("pantry_item");
    expect(revalidateFor.mock.invocationCallOrder[0]).toBeGreaterThan(applyPantryInventoryIn.mock.invocationCallOrder[0]);
  });

  it("removes without asking the catalog when there are only removals", async () => {
    const result = await confirmPantryInventory(input({ items: [], replaceRowIds: [] }));
    expect(result).toEqual(
      ok({ set: 0, removed: [removedRow], removedCount: 1, undoable: 1, setIngredientIds: [], operationId: operation }),
    );
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(applyPantryInventoryIn).toHaveBeenCalledWith(db, {
      place: "Kyl",
      items: [],
      replaceRowIds: [],
      removeRowIds: [rowId],
      operationId: operation,
      siteId: stugan,
    });
  });

  it("never saves a synonym: an existing id goes as an exact match, a new name as its own text", async () => {
    await confirmPantryInventory(input({ items: [existing(mjolk), fresh("matlagningsgrädde", { amount: 2, unit: "dl" })] }));
    const [choices] = commitIngredients.mock.calls[0];
    expect(choices.map((choice: { ingredient: { kind: string } }) => choice.ingredient.kind)).toEqual(["match", "new"]);
    expect(choices[1].text).toBe(choices[1].ingredient.proposal.name);
  });

  it("returns unauthorized without an allowed user, and writes nothing", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await confirmPantryInventory(input())).toEqual(fail("unauthorized"));
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(applyPantryInventoryIn).not.toHaveBeenCalled();
  });

  it("names each item that is not valid by its index", async () => {
    const result = await confirmPantryInventory(input({ items: [existing(mjolk), existing(mjolk, { unit: "tub" as never })] }));
    expect(result).toEqual(fail("validation", { "1": "Förslaget går inte att spara som det är. Rätta eller avvisa det." }));
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it.each([
    ["an empty request", input({ items: [], removeRowIds: [] })],
    ["more than 40 items", input({ items: Array.from({ length: 41 }, () => existing(mjolk)) })],
    ["more than 50 rows to replace", input({ replaceRowIds: Array.from({ length: 51 }, () => otherRowId) })],
    ["more than 1 000 rows to remove", input({ removeRowIds: Array.from({ length: 1001 }, () => rowId) })],
    ["a row id that is not a uuid", input({ removeRowIds: ["yoghurt"] })],
    ["removals without an operation id", input({ operationId: null })],
    ["an operation id that is not a uuid", input({ operationId: "op-1" })],
    ["an unknown place", input({ location: "Källare" as never })],
    ["a place that is not a uuid", input({ siteId: "stugan" })],
    ["no place", { ...input(), siteId: undefined } as never],
    ["no object", "mjölk" as never],
  ])("refuses %s with validation, and writes nothing", async (_case, wrong) => {
    expect(await confirmPantryInventory(wrong)).toMatchObject({ ok: false, error: { code: "validation" } });
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(applyPantryInventoryIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("writes nothing to the pantry when the catalog fails", async () => {
    commitIngredients.mockRejectedValue(new CatalogDataError("unknown_ingredient"));
    expect(await confirmPantryInventory(input())).toEqual(fail("pantry_inventory_failed"));
    expect(log).toHaveBeenCalledWith("pantry_inventory_failed", { reason: "catalog_unknown_ingredient", detail: undefined });
    expect(applyPantryInventoryIn).not.toHaveBeenCalled();
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives pantry_inventory_failed when the write is refused, logged with its reason, without revalidating", async () => {
    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("apply_failed 23503"));
    expect(await confirmPantryInventory(input())).toEqual(fail("pantry_inventory_failed"));
    expect(log).toHaveBeenCalledWith("pantry_inventory_failed", {
      reason: "pantry_data: apply_failed 23503",
      detail: "apply_failed 23503",
    });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("answers ok after the commit when the answer cannot all be read, with a warning and revalidation", async () => {
    applyPantryInventoryIn.mockResolvedValueOnce({
      set: [],
      removed: [],
      removedCount: 0,
      replaced: 0,
      undoable: 0,
      unreadable: true,
    });
    const result = await confirmPantryInventory(input({ removeRowIds: [], operationId: null, replaceRowIds: [] }));
    expect(result).toMatchObject({ ok: true, data: { set: 0, setIngredientIds: [mjolk, agg] } });
    expect(console.warn).toHaveBeenCalledWith("pantry_inventory_answer_unreadable", { set: 0, expected: 2 });
    expect(revalidateFor).toHaveBeenCalledTimes(1);
  });

  it("answers ok with fewer rows removed or replaced than asked, logging counts only", async () => {
    applyPantryInventoryIn.mockResolvedValueOnce({
      set: [],
      removed: [],
      removedCount: 0,
      replaced: 0,
      undoable: 0,
      unreadable: false,
    });
    expect(await confirmPantryInventory(input({ items: [] }))).toEqual(
      ok({ set: 0, removed: [], removedCount: 0, undoable: 0, setIngredientIds: [], operationId: operation }),
    );
    expect(console.info).toHaveBeenCalledWith("pantry_inventory_skipped", { requested: 1, removed: 0 });
    expect(console.info).toHaveBeenCalledWith("pantry_inventory_replace_skipped", { requested: 1, replaced: 0 });
    expect(revalidateFor).toHaveBeenCalledTimes(1);
  });

  it("tries once more with a new operation id when it is taken (MK409), and gives the new id back", async () => {
    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("apply_failed MK409"));
    const result = await confirmPantryInventory(input());
    expect(applyPantryInventoryIn).toHaveBeenCalledTimes(2);
    const retried = applyPantryInventoryIn.mock.calls[1][1].operationId;
    expect(retried).toMatch(/^[0-9a-f-]{36}$/);
    expect(retried).not.toBe(operation);
    // The retry keeps the photo's place (Story 8.4).
    expect(applyPantryInventoryIn.mock.calls[1][1].siteId).toBe(stugan);
    expect(result).toMatchObject({ ok: true, data: { operationId: retried } });

    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("apply_failed MK409"));
    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("apply_failed MK409"));
    expect(await confirmPantryInventory(input())).toEqual(fail("pantry_inventory_failed"));
  });

  it("never logs names or amounts", async () => {
    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("apply_failed 23503"));
    await confirmPantryInventory(input({ items: [fresh("hemligvara", { amount: 7 })] }));
    commitIngredients.mockRejectedValueOnce(new CatalogDataError("query_failed", "08006"));
    await confirmPantryInventory(input({ items: [fresh("hemligvara", { amount: 7 })] }));
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/hemligvara|7/);
  });

  it("lets other errors through", async () => {
    applyPantryInventoryIn.mockRejectedValue(new Error("boom"));
    await expect(confirmPantryInventory(input())).rejects.toThrow("boom");
  });

  it("sends null for the selected place (a photo of a user without places)", async () => {
    await confirmPantryInventory(input({ siteId: null }));
    expect(applyPantryInventoryIn.mock.calls[0][1].siteId).toBeNull();
  });

  it("gives pantry_site_gone for a place that is gone, reads the page again, and revalidates no pantry (Story 8.4)", async () => {
    applyPantryInventoryIn.mockRejectedValueOnce(new PantryDataError("site_gone"));
    expect(await confirmPantryInventory(input())).toEqual(fail("pantry_site_gone"));
    expect(applyPantryInventoryIn).toHaveBeenCalledTimes(1);
    expect(revalidateFor).toHaveBeenCalledExactlyOnceWith("pantry_site");
    expect(log).toHaveBeenCalledWith("pantry_site_gone", { reason: "MK410" });
  });
});
