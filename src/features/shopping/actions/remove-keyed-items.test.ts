import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import { ShoppingDataError } from "../data/client";

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ session: true }) }));
const revalidateFor = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateFor: (table: string) => revalidateFor(table) }));
const removeCustomItemIn = vi.fn();
vi.mock("../data/custom-items", () => ({ removeCustomItemIn: (...args: unknown[]) => removeCustomItemIn(...args) }));

const { removeKeyedItems } = await import("./remove-keyed-items");
const { keyedItemId } = await import("../data/keyed-item-id");

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "p@example.com" }));
  removeCustomItemIn.mockReset().mockResolvedValue({ row: null });
  revalidateFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("removeKeyedItems", () => {
  it("removes the items whose ids are made from the keys, each once, and counts those that were there", async () => {
    removeCustomItemIn.mockResolvedValueOnce({ row: null }).mockResolvedValueOnce(null);
    expect(await removeKeyedItems({ keys: ["recipe:a:b", "recipe:a:c", "recipe:a:b"] })).toEqual(ok({ removed: 1 }));
    expect(removeCustomItemIn.mock.calls.map((call) => call[1])).toEqual([keyedItemId("recipe:a:b"), keyedItemId("recipe:a:c")]);
    expect(revalidateFor).toHaveBeenCalledWith("shopping_custom_item");
  });

  it("fails without a user, with bad input and when removing fails", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await removeKeyedItems({ keys: ["k"] })).toEqual(fail("unauthorized"));
    requireUser.mockResolvedValue(ok({ id: "user", email: "p@example.com" }));
    expect(await removeKeyedItems({ keys: [] })).toEqual(fail("validation"));
    removeCustomItemIn.mockRejectedValueOnce(new ShoppingDataError("remove_failed 500", "500"));
    expect(await removeKeyedItems({ keys: ["k"] })).toEqual(fail("shopping_remove_failed"));
  });
});
