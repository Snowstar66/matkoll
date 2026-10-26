import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

// addCustomItem, removeCustomItem and restoreCustomItem with the user check,
// the session client, the data functions and revalidation stubbed. The
// catalog is stubbed only to show that the list never writes to it. The database compares the plan with the current one under the
// meal plan lock; here the data functions say what they found.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", () => ({ commitIngredients: (...args: unknown[]) => commitIngredients(...args) }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const addCustomItemIn = vi.fn();
const removeCustomItemIn = vi.fn();
vi.mock("../data/custom-items", () => ({
  addCustomItemIn: (...args: unknown[]) => addCustomItemIn(...args),
  removeCustomItemIn: (...args: unknown[]) => removeCustomItemIn(...args),
}));

const { addCustomItem } = await import("./add-custom-item");
const { removeCustomItem } = await import("./remove-custom-item");
const { restoreCustomItem } = await import("./restore-custom-item");

const planId = "33333333-3333-4333-8333-333333333333";
const id = "22222222-2222-4222-8222-222222222222";
const kaffe = "11111111-1111-4111-8111-111111111111";
const row = { id, planId, label: "Kaffe bryggmalet", ingredientId: kaffe, amount: 2, unit: "förp" as const };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  commitIngredients.mockReset().mockResolvedValue([kaffe]);
  addCustomItemIn.mockReset().mockImplementation(async (_db, item) => item);
  removeCustomItemIn.mockReset().mockResolvedValue({ row });
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addCustomItem", () => {
  it("adds text alone with the client's id, without touching the catalog, and revalidates the list", async () => {
    const result = await addCustomItem({ id, planId, label: " diskmedel ", amount: "", unit: "" });
    const added = { id, planId, label: "diskmedel", ingredientId: null, amount: null, unit: null };
    expect(result).toEqual(ok(added));
    expect(addCustomItemIn).toHaveBeenCalledWith(db, added);
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("makes an id when none is sent", async () => {
    const result = await addCustomItem({ planId, label: "diskmedel", amount: "", unit: "" });
    expect(result.ok && result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("stores a chosen catalog ingredient as the link only, without writing to the catalog", async () => {
    const result = await addCustomItem({ id, planId, label: "Kaffe bryggmalet", ingredientId: kaffe, amount: "2", unit: "förp" });
    expect(result).toEqual(ok(row));
    expect(addCustomItemIn).toHaveBeenCalledWith(db, row);
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it("gives the form's messages without writing", async () => {
    expect(await addCustomItem({ planId, label: " ", amount: "2", unit: "" })).toEqual(
      fail("validation", { label: "Skriv vad du vill lägga till.", unit: "Välj en enhet." }),
    );
    expect(await addCustomItem({ planId: "x", label: "a", amount: "", unit: "" })).toEqual(fail("validation"));
    expect(await addCustomItem(undefined as never)).toEqual(fail("validation"));
    expect(addCustomItemIn).not.toHaveBeenCalled();
    expect(commitIngredients).not.toHaveBeenCalled();
  });

  it("returns unauthorized without an allowed user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await addCustomItem({ planId, label: "a", amount: "", unit: "" })).toEqual(fail("unauthorized"));
    expect(addCustomItemIn).not.toHaveBeenCalled();
  });

  it("gives shopping_plan_changed, without revalidating, when the plan is no longer the current one", async () => {
    addCustomItemIn.mockResolvedValue("plan_changed");
    expect(await addCustomItem({ planId, label: "a", amount: "", unit: "" })).toEqual(fail("shopping_plan_changed"));
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("gives shopping_save_failed, logged, when the item cannot be written (e.g. another user's ingredient)", async () => {
    addCustomItemIn.mockRejectedValue(new ShoppingDataError("add_failed 23503", "23503"));
    expect(await addCustomItem({ planId, label: "a", amount: "", unit: "" })).toEqual(fail("shopping_save_failed"));
    expect(log).toHaveBeenCalledWith("shopping_save_failed", { reason: "add_failed 23503" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("throws other errors, which are bugs", async () => {
    addCustomItemIn.mockRejectedValue(new TypeError("bug"));
    await expect(addCustomItem({ planId, label: "a", amount: "", unit: "" })).rejects.toThrow("bug");
  });
});

describe("removeCustomItem", () => {
  it("deletes the item, returns it for Ångra and revalidates the list", async () => {
    expect(await removeCustomItem(id)).toEqual(ok(row));
    expect(removeCustomItemIn).toHaveBeenCalledWith(db, id);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("returns null when the deleted row cannot be put back", async () => {
    removeCustomItemIn.mockResolvedValue({ row: null });
    expect(await removeCustomItem(id)).toEqual(ok(null));
  });

  it("gives shopping_remove_failed, and revalidates, when there is no such item", async () => {
    removeCustomItemIn.mockResolvedValue(null);
    expect(await removeCustomItem(id)).toEqual(fail("shopping_remove_failed"));
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("gives shopping_plan_changed when the item's plan is no longer the current one", async () => {
    removeCustomItemIn.mockResolvedValue("plan_changed");
    expect(await removeCustomItem(id)).toEqual(fail("shopping_plan_changed"));
  });

  it("gives shopping_remove_failed, logged, when Postgres refuses", async () => {
    removeCustomItemIn.mockRejectedValue(new ShoppingDataError("remove_failed 08006", "08006"));
    expect(await removeCustomItem(id)).toEqual(fail("shopping_remove_failed"));
    expect(log).toHaveBeenCalledWith("shopping_remove_failed", { reason: "remove_failed 08006" });
  });

  it("refuses an id that is not one, and a request without a user", async () => {
    expect(await removeCustomItem("x")).toEqual(fail("validation"));
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await removeCustomItem(id)).toEqual(fail("unauthorized"));
    expect(removeCustomItemIn).not.toHaveBeenCalled();
  });
});

describe("restoreCustomItem", () => {
  it("puts the row back with the same id and revalidates the list", async () => {
    expect(await restoreCustomItem(row)).toEqual(ok(row));
    expect(addCustomItemIn).toHaveBeenCalledWith(db, row);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("trims the text with single spaces, as the form saves it", async () => {
    await restoreCustomItem({ ...row, label: "  Kaffe \t bryggmalet " });
    expect(addCustomItemIn).toHaveBeenCalledWith(db, row);
    expect(await restoreCustomItem({ ...row, label: "\t\n" })).toEqual(fail("validation"));
  });

  it("refuses a row that is not one", async () => {
    expect(await restoreCustomItem({ ...row, unit: null })).toEqual(fail("validation"));
    expect(addCustomItemIn).not.toHaveBeenCalled();
  });

  it("gives shopping_plan_changed or shopping_restore_failed when it cannot be put back", async () => {
    addCustomItemIn.mockResolvedValue("plan_changed");
    expect(await restoreCustomItem(row)).toEqual(fail("shopping_plan_changed"));
    addCustomItemIn.mockRejectedValue(new ShoppingDataError("add_failed 23505", "23505"));
    expect(await restoreCustomItem(row)).toEqual(fail("shopping_restore_failed"));
    expect(log).toHaveBeenCalledWith("shopping_restore_failed", { reason: "add_failed 23505" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });
});
