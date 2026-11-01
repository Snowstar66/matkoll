import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, MatchItem } from "@/features/catalog";
import { fail, ok } from "@/lib/errors";
import { fillFixtureDates } from "@/server/fetch/fixture-sites";
import type { OffersDb } from "../data/client";
import { readOfferPage, type OfferPageRead } from "../domain/offer-page-read";
import { addDays, weekStartOf } from "../domain/week";
import { saveOfferPageIn, type OfferCatalog } from "./save-offer-page";

// saveOfferPageIn with a stubbed client and catalog (Story 17.11): the save
// step that the in-app fetch and the scheduled one share. What it sends to
// save_store_offers, through whichever client it is given.

const storeId = "11111111-1111-4111-8111-111111111111";
const laxfile = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const db = { rpc: (...args: unknown[]) => rpc(...args) } as unknown as OffersDb;

const catalog: OfferCatalog = {
  match: async (items: readonly MatchItem[]): Promise<IngredientMatch[]> =>
    items.map((item) =>
      item.text === "laxfilé"
        ? { kind: "match", ingredientId: laxfile, name: "laxfilé", confidence: "exact" }
        : { kind: "unmatched" },
    ) as IngredientMatch[],
  summaries: async (ids) => Object.fromEntries(ids.map((id) => [id, { id, name: "laxfilé", section: "Kött och fisk" }])) as never,
};

function pageRead(): OfferPageRead {
  const html = fillFixtureDates(readFileSync("tests/fixtures/sites/ica-erbjudanden.html", "utf8"));
  const read = readOfferPage(html, new Date());
  if (!read.ok) throw new Error(read.error.code);
  return read.data;
}

beforeEach(() => {
  rpc.mockReset().mockImplementation(async (_name, args: { items: unknown[] }) => ({ data: args.items.length, error: null }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("saveOfferPageIn", () => {
  it("saves the page's offers for the store and week through the given client, replacing the link's rows", async () => {
    const read = pageRead();
    expect(await saveOfferPageIn(db, { storeId, read }, catalog)).toEqual(ok({ weekStart: weekStartOf(new Date()), saved: 7, matched: 1, withRegularPrice: 3 }));
    expect(rpc).toHaveBeenCalledTimes(1);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe("save_store_offers");
    expect(args).toMatchObject({ store: storeId, week: weekStartOf(new Date()), replace_source: "link" });
    expect(args.items).toHaveLength(7);
    expect(args.items[1]).toMatchObject({ label: "Havets Laxfilé", name: "laxfilé", ingredient_id: laxfile, section: "Kött och fisk", source: "link" });
    expect(args.items[0]).toMatchObject({ label: "Gårdens Herrgård, Präst", ingredient_id: null, member_only: true });
  });

  it("saves each week the page gave, this week first, and gives the newest week's counts (Story 17.11)", async () => {
    const read = pageRead();
    const thisWeek = weekStartOf(new Date());
    const nextWeek = addDays(thisWeek, 7);
    const two: OfferPageRead = { ...read, weeks: [read.weeks[0], { weekStart: nextWeek, entries: read.weeks[0].entries.slice(0, 2) }] };
    expect(await saveOfferPageIn(db, { storeId, read: two }, catalog)).toEqual(ok({ weekStart: nextWeek, saved: 2, matched: 1, withRegularPrice: expect.any(Number) }));
    expect(rpc.mock.calls.map((call) => [call[1].week, call[1].items.length, call[1].replace_source])).toEqual([
      [thisWeek, 7, "link"],
      [nextWeek, 2, "link"],
    ]);
  });

  it("stops at a week that fails, and gives its error", async () => {
    const read = pageRead();
    const two: OfferPageRead = { ...read, weeks: [read.weeks[0], { weekStart: addDays(read.weeks[0].weekStart, 7), entries: read.weeks[0].entries }] };
    rpc.mockResolvedValueOnce({ data: null, error: { code: "MK422" } });
    expect(await saveOfferPageIn(db, { storeId, read: two }, catalog)).toEqual(fail("offers_limit"));
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("gives offers_page_old when the database refuses the week", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "MK416" } });
    expect(await saveOfferPageIn(db, { storeId, read: pageRead() }, catalog)).toEqual(fail("offers_page_old"));
  });

  it("passes on the other refusals", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0002" } });
    expect(await saveOfferPageIn(db, { storeId, read: pageRead() }, catalog)).toEqual(fail("offers_store_missing"));
  });

  it("lets a catalog failure through, and saves nothing", async () => {
    const broken = { ...catalog, match: async () => Promise.reject(new Error("catalog")) };
    await expect(saveOfferPageIn(db, { storeId, read: pageRead() }, broken)).rejects.toThrow("catalog");
    expect(rpc).not.toHaveBeenCalled();
  });
});
