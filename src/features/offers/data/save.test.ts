import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";
import type { OfferDraft } from "../domain/offer";
import type { OffersDb } from "./client";
import { saveOffersIn } from "./save";

// saveOffersIn with a stubbed client: what it sends to save_store_offers and
// how it reads the function's SQLSTATE codes. The function itself is tested
// against local Supabase in tests/integration/offers.test.ts.

const rpc = vi.fn();
const db = { rpc: (...args: unknown[]) => rpc(...args) } as unknown as OffersDb;

const draft: OfferDraft = {
  label: "Havets Laxfilé",
  name: "laxfilé",
  ingredientId: null,
  section: "Kött och fisk",
  price: "129 kr/kg",
  note: null,
  memberOnly: false,
  validTo: "2026-11-01",
  source: "link",
  regularPrice: 149.5,
  savingPercent: 14,
};

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveOffersIn", () => {
  it("sends the drafts in the table's columns and gives the week's count", async () => {
    rpc.mockResolvedValue({ data: 7, error: null });
    expect(await saveOffersIn(db, { storeId: "s", weekStart: "2026-10-26", items: [draft], replaceSource: "link" })).toEqual(ok(7));
    expect(rpc).toHaveBeenCalledWith("save_store_offers", {
      store: "s",
      week: "2026-10-26",
      items: [
        {
          label: "Havets Laxfilé",
          name: "laxfilé",
          ingredient_id: null,
          section: "Kött och fisk",
          price: "129 kr/kg",
          note: null,
          member_only: false,
          valid_to: "2026-11-01",
          source: "link",
          regular_price: 149.5,
          saving_percent: 14,
        },
      ],
      replace_source: "link",
    });
  });

  it("leaves replace_source out when nothing is replaced", async () => {
    rpc.mockResolvedValue({ data: 1, error: null });
    await saveOffersIn(db, { storeId: "s", weekStart: "2026-10-26", items: [draft] });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("replace_source");
  });

  it.each([
    ["MK416", "offers_week_invalid"],
    ["MK422", "offers_limit"],
    ["P0002", "offers_store_missing"],
    ["23514", "offers_failed"],
    ["42501", "offers_failed"],
  ] as const)("reads %s as %s", async (code, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: "x" } });
    expect(await saveOffersIn(db, { storeId: "s", weekStart: "2026-10-26", items: [draft] })).toEqual(fail(expected));
  });
});
