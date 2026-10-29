import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ session: true }) }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const addCustomItemIn = vi.fn();
vi.mock("../data/custom-items", () => ({ addCustomItemIn: (...args: unknown[]) => addCustomItemIn(...args) }));

const { addKeyedItems } = await import("./add-keyed-items");
const planId = "33333333-3333-4333-8333-333333333333";
const kaffe = "11111111-1111-4111-8111-111111111111";
const input = {
  planId,
  items: [
    { key: "offer-1", label: "Ost  (Erbjudande: 89 kr/kg)", ingredientId: kaffe },
    { key: "offer-2", label: "Gul lök (Erbjudande)", ingredientId: null },
  ],
};

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "p@example.com" }));
  addCustomItemIn.mockReset().mockImplementation(async (_db, row) => row);
  revalidateFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addKeyedItems", () => {
  it("adds one own item per key, with an id made from the key, so the same offer twice is the same item", async () => {
    expect(await addKeyedItems(input)).toEqual(ok({ count: 2 }));
    await addKeyedItems(input);
    const rows = addCustomItemIn.mock.calls.map((call) => call[1]);
    expect(rows).toHaveLength(4);
    expect(rows[0].id).toBe(rows[2].id);
    expect(rows[0].id).not.toBe(rows[1].id);
    expect(rows[0]).toMatchObject({ planId, label: "Ost (Erbjudande: 89 kr/kg)", ingredientId: kaffe, amount: null, unit: null });
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("fails without a user, with bad input, when the plan changed and when saving fails", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addKeyedItems(input)).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "p@example.com" }));
    expect(await addKeyedItems({ planId, items: [] })).toEqual(fail("validation"));
    addCustomItemIn.mockResolvedValueOnce("plan_changed");
    expect(await addKeyedItems(input)).toEqual(fail("shopping_plan_changed"));
    addCustomItemIn.mockRejectedValueOnce(new ShoppingDataError("add_failed 23503", "23503"));
    expect(await addKeyedItems(input)).toEqual(fail("shopping_save_failed"));
  });
});
