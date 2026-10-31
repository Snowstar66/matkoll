import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

// Story 3.6's actions with the user check, the session client, the data
// functions and revalidation stubbed: setLineAmount, clearLineAmount,
// hideLine, restoreLine and updateCustomItem. The database compares the plan
// with the current one under the meal plan lock; here the data functions say
// what they found.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
const db = { session: true };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const setLineAmountIn = vi.fn();
const hideLineIn = vi.fn();
const restoreLineIn = vi.fn();
const showLineIn = vi.fn();
vi.mock("../data/overrides", () => ({
  setLineAmountIn: (...args: unknown[]) => setLineAmountIn(...args),
  hideLineIn: (...args: unknown[]) => hideLineIn(...args),
  restoreLineIn: (...args: unknown[]) => restoreLineIn(...args),
  showLineIn: (...args: unknown[]) => showLineIn(...args),
}));
const updateCustomItemIn = vi.fn();
vi.mock("../data/custom-items", () => ({ updateCustomItemIn: (...args: unknown[]) => updateCustomItemIn(...args) }));

const { setLineAmount } = await import("./set-line-amount");
const { clearLineAmount } = await import("./clear-line-amount");
const { hideLine } = await import("./hide-line");
const { restoreLine } = await import("./restore-line");
const { updateCustomItem } = await import("./update-custom-item");
const { showLine } = await import("./show-line");

const planId = "33333333-3333-4333-8333-333333333333";
const gradde = "11111111-1111-4111-8111-111111111111";
const overrideId = "44444444-4444-4444-8444-444444444444";
const itemId = "22222222-2222-4222-8222-222222222222";
const key = `r:${gradde}:dl`;
const previous = { id: overrideId, planId, key, amount: 2, baseAmount: 3, hidden: false };
const hiddenUpdatedAt = "2026-10-26T05:12:29.123456+00:00";
const hidden = { previous, hiddenUpdatedAt };

let log: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  setLineAmountIn.mockReset().mockResolvedValue("saved");
  hideLineIn.mockReset().mockResolvedValue(hidden);
  showLineIn.mockReset().mockResolvedValue("saved");
  restoreLineIn.mockReset().mockResolvedValue("saved");
  updateCustomItemIn.mockReset().mockImplementation(async (_db, row) => row);
  revalidateFor.mockReset();
  log?.mockRestore();
  log = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("setLineAmount", () => {
  it("saves the amount read with parseQuantity, with the counted amount, and revalidates the list", async () => {
    expect(await setLineAmount({ planId, key, amount: " 1,5 ", baseAmount: 3 })).toEqual(
      ok({ planId, key, amount: 1.5, baseAmount: 3 }),
    );
    expect(setLineAmountIn).toHaveBeenCalledWith(db, planId, key, 1.5, 3);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
  });

  it.each(["två", "0", "", "-1", "1-2"])("refuses %j with the field's message, without writing", async (amount) => {
    expect(await setLineAmount({ planId, key, amount })).toEqual(
      fail("validation", { amount: "Ange ett tal större än 0." }),
    );
    expect(setLineAmountIn).not.toHaveBeenCalled();
  });

  it("refuses a line without a unit or an own item", async () => {
    for (const other of [`r:${gradde}:-`, "t:2 citroner", `c:${itemId}`, "x"]) {
      expect(await setLineAmount({ planId, key: other, amount: "2" })).toEqual(fail("validation"));
    }
    expect(setLineAmountIn).not.toHaveBeenCalled();
  });

  it("says when the plan changed, and logs a failure", async () => {
    setLineAmountIn.mockResolvedValueOnce("plan_changed");
    expect(await setLineAmount({ planId, key, amount: "2" })).toEqual(fail("shopping_plan_changed"));
    setLineAmountIn.mockRejectedValueOnce(new ShoppingDataError("amount_failed 08006"));
    expect(await setLineAmount({ planId, key, amount: "2" })).toEqual(fail("shopping_save_failed"));
    expect(log).toHaveBeenCalledWith("shopping_save_failed", { reason: "amount_failed 08006" });
    expect(revalidateFor).not.toHaveBeenCalled();
  });

  it("writes nothing without a signed-in user", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await setLineAmount({ planId, key, amount: "2" })).toEqual(fail("unauthorized"));
    expect(setLineAmountIn).not.toHaveBeenCalled();
  });
});

describe("clearLineAmount", () => {
  it("goes back to the counted amount", async () => {
    expect(await clearLineAmount({ planId, key })).toEqual(ok({ planId, key }));
    expect(setLineAmountIn).toHaveBeenCalledWith(db, planId, key, null);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
  });

  it("refuses a key without an amount, and passes the plan check on", async () => {
    expect(await clearLineAmount({ planId, key: `r:${gradde}:-` })).toEqual(fail("validation"));
    setLineAmountIn.mockResolvedValueOnce("plan_changed");
    expect(await clearLineAmount({ planId, key })).toEqual(fail("shopping_plan_changed"));
  });
});

describe("hideLine", () => {
  it("hides the line and returns its override as it was, with the hidden row's updated_at", async () => {
    expect(await hideLine({ planId, key })).toEqual(ok(hidden));
    expect(hideLineIn).toHaveBeenCalledWith(db, planId, key);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
    hideLineIn.mockResolvedValueOnce({ previous: null, hiddenUpdatedAt });
    expect(await hideLine({ planId, key: "t:2 citroner" })).toEqual(ok({ previous: null, hiddenUpdatedAt }));
  });

  it("gives null, not a failure, when the line is hidden but the row before cannot be read", async () => {
    hideLineIn.mockResolvedValueOnce("unrestorable");
    expect(await hideLine({ planId, key })).toEqual(ok(null));
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
  });

  it("never hides an own item; an own item is removed instead", async () => {
    expect(await hideLine({ planId, key: `c:${itemId}` })).toEqual(fail("validation"));
    expect(hideLineIn).not.toHaveBeenCalled();
  });

  it("says when the plan changed, and gives shopping_remove_failed on a failure", async () => {
    hideLineIn.mockResolvedValueOnce("plan_changed");
    expect(await hideLine({ planId, key })).toEqual(fail("shopping_plan_changed"));
    hideLineIn.mockRejectedValueOnce(new ShoppingDataError("hide_failed 08006"));
    expect(await hideLine({ planId, key })).toEqual(fail("shopping_remove_failed"));
    expect(log).toHaveBeenCalledWith("shopping_remove_failed", { reason: "hide_failed 08006" });
  });
});

describe("restoreLine", () => {
  it("puts the override back, or deletes it when there was none", async () => {
    expect(await restoreLine({ planId, key, previous, hiddenUpdatedAt })).toEqual(ok({ planId, key, previous, hiddenUpdatedAt }));
    expect(restoreLineIn).toHaveBeenCalledWith(db, planId, key, previous, hiddenUpdatedAt);
    expect(await restoreLine({ planId, key, previous: null, hiddenUpdatedAt: null })).toEqual(
      ok({ planId, key, previous: null, hiddenUpdatedAt: null }),
    );
    expect(restoreLineIn).toHaveBeenLastCalledWith(db, planId, key, null, null);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
  });

  it("refuses another line's override", async () => {
    expect(await restoreLine({ planId, key, previous: { ...previous, key: `r:${gradde}:g` }, hiddenUpdatedAt })).toEqual(
      fail("validation"),
    );
    expect(await restoreLine({ planId: itemId, key, previous, hiddenUpdatedAt })).toEqual(fail("validation"));
    expect(restoreLineIn).not.toHaveBeenCalled();
  });

  it("says when the plan changed, and gives shopping_restore_failed on a failure", async () => {
    restoreLineIn.mockResolvedValueOnce("plan_changed");
    expect(await restoreLine({ planId, key, previous, hiddenUpdatedAt })).toEqual(fail("shopping_plan_changed"));
    restoreLineIn.mockRejectedValueOnce(new ShoppingDataError("restore_failed 08006"));
    expect(await restoreLine({ planId, key, previous, hiddenUpdatedAt })).toEqual(fail("shopping_restore_failed"));
  });
});

describe("updateCustomItem", () => {
  it("saves the form's values on the item's id and revalidates the list", async () => {
    const result = await updateCustomItem({ id: itemId, planId, label: " diskmedel  eko ", amount: "2", unit: "förp" });
    const saved = { id: itemId, label: "diskmedel eko", ingredientId: null, amount: 2, unit: "förp" };
    expect(result).toEqual(ok(saved));
    expect(updateCustomItemIn).toHaveBeenCalledWith(db, saved);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("gives the form's messages, and needs the item's id", async () => {
    expect(await updateCustomItem({ id: itemId, planId, label: "", amount: "2", unit: "" })).toEqual(
      fail("validation", { label: "Skriv vad du vill lägga till.", unit: "Välj en enhet." }),
    );
    expect(await updateCustomItem({ planId, label: "diskmedel", amount: "", unit: "" })).toEqual(fail("validation"));
    expect(updateCustomItemIn).not.toHaveBeenCalled();
  });

  it("says when the item is gone, and gives shopping_save_failed when the write fails", async () => {
    const input = { id: itemId, label: "diskmedel", amount: "", unit: "" as const };
    updateCustomItemIn.mockResolvedValueOnce("not_found");
    expect(await updateCustomItem(input)).toEqual(fail("shopping_item_gone"));
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
    updateCustomItemIn.mockRejectedValueOnce(new ShoppingDataError("update_failed 23503"));
    expect(await updateCustomItem(input)).toEqual(fail("shopping_save_failed"));
  });
});

describe("showLine", () => {
  it("shows a hidden line again and revalidates the list", async () => {
    expect(await showLine({ planId, key })).toEqual(ok({ planId, key }));
    expect(showLineIn).toHaveBeenCalledWith(db, planId, key);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_line_override");
  });

  it("refuses an own item's key, says when the plan changed, and logs a failure", async () => {
    expect(await showLine({ planId, key: `c:${itemId}` })).toEqual(fail("validation"));
    showLineIn.mockResolvedValueOnce("plan_changed");
    expect(await showLine({ planId, key })).toEqual(fail("shopping_plan_changed"));
    showLineIn.mockRejectedValueOnce(new ShoppingDataError("show_failed 08006"));
    expect(await showLine({ planId, key })).toEqual(fail("shopping_save_failed"));
    expect(log).toHaveBeenCalledWith("shopping_save_failed", { reason: "show_failed 08006" });
  });
});
