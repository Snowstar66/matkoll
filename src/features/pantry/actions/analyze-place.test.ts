import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, Location, MatchItem } from "@/features/catalog";
import { fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { aiPantryItem, analyzeImageAnswer } from "@/server/ai/schemas";
import { inputLimits, withInputValidation, type AnalyzeImageInput, type RunOptions } from "@/server/ai/service";
import { analyzeResultSchema, maxPantrySuggestions } from "../domain/pantry-suggestion";
import type { PantryItem } from "../domain/pantry-item";

// analyzePlace with the AI port's mock (tests/fixtures/ai, behind the port's
// input check, as with AI_PROVIDER=mock) and stubbed user, catalog and
// pantry reads. The session client is a stand-in that fails the test if
// anything uses it: the analysis only reads, through the stubbed functions.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));

const { CatalogDataError, PantryDataError } = vi.hoisted(() => ({
  CatalogDataError: class CatalogDataError extends Error {
    constructor(readonly code: string) {
      super(`catalog_${code}`);
    }
  },
  PantryDataError: class PantryDataError extends Error {
    constructor(readonly detail: string) {
      super(`pantry_data: ${detail}`);
    }
  },
}));
const matchIngredients = vi.fn<(items: readonly MatchItem[]) => Promise<IngredientMatch[]>>();
const getIngredientNames = vi.fn<(ids: readonly string[]) => Promise<Record<string, string>>>();
const commitIngredients = vi.fn();
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  matchIngredients: (items: readonly MatchItem[]) => matchIngredients(items),
  getIngredientNames: (ids: readonly string[]) => getIngredientNames(ids),
  commitIngredients: (...args: unknown[]) => commitIngredients(...args),
}));

const db = { from: vi.fn(), rpc: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db }));
vi.mock("../data/client", () => ({ PantryDataError }));
const listPantryIn = vi.fn<(client: unknown, location: Location, names: unknown) => Promise<PantryItem[]>>();
vi.mock("../data/queries", () => ({
  listPantryIn: (client: unknown, location: Location, names: unknown) => listPantryIn(client, location, names),
}));

const ai = withInputValidation(createMockAiService());
const analyzeImage = vi.fn(ai.analyzeImage);
const locateItems = vi.fn(ai.locateItems);
vi.mock("@/server/ai", () => ({ getAiService: () => ({ analyzeImage, locateItems }), minLoopRepeats: 2 }));

const { analyzePlace, minReadMs, postModelMarginMs } = await import("./analyze-place");
const { locatePlaceItems } = await import("./locate-place-items");

const fixtures = new URL("../../../../tests/fixtures/ai/", import.meta.url);
const photo = (file: string) => ({ data: new Uint8Array(readFileSync(new URL(file, fixtures))), mediaType: "image/png" });
const kyl = photo("kyl.png");
const fixture = analyzeImageAnswer
  .parse(JSON.parse(readFileSync(new URL("kyl.analyze.json", fixtures), "utf8")))
  .items.map((item) => aiPantryItem.parse(item));
const answer = (items: typeof fixture, invalid = 0, repeated = 0) => ok({ items, invalid, repeated });

const mjolk = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const smor = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02";
/** The catalog knows these by the AI's hint; everything else is new. */
const known: Record<string, string> = { mjölk: mjolk, smör: smor };
const catalogNames: Record<string, string> = { [mjolk]: "Mjölk", [smor]: "Smör" };
const hemma = "5a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a00";
const atHome: PantryItem[] = [
  { id: "7a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01", siteId: hemma, ingredientId: mjolk, name: "Mjölk", location: "Kyl", amount: 2, unit: "förp" },
  { id: "7a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a02", siteId: hemma, ingredientId: smor, name: "Smör", location: "Kyl", amount: null, unit: null },
];
const signal = () => new AbortController().signal;
const user = (userId = "user") => ok({ id: userId, email: "pontus@example.com" });

function matchByHint(items: readonly MatchItem[]): IngredientMatch[] {
  return items.map((item): IngredientMatch => {
    const matched = item.hint ? known[item.hint.name] : undefined;
    return matched
      ? { kind: "match", ingredientId: matched, confidence: "hint" }
      : { kind: "new", proposal: { name: item.hint?.name ?? item.text, section: "Övrigt", location: "Skafferi", defaultUnit: null } };
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  requireUser.mockReset().mockResolvedValue(user());
  matchIngredients.mockReset().mockImplementation(async (items) => matchByHint(items));
  getIngredientNames.mockReset().mockImplementation(async (ids) =>
    Object.fromEntries(ids.flatMap((wanted) => (catalogNames[wanted] ? [[wanted, catalogNames[wanted]]] : []))),
  );
  listPantryIn.mockReset().mockResolvedValue(atHome);
  analyzeImage.mockReset().mockImplementation(ai.analyzeImage);
  locateItems.mockReset().mockImplementation(ai.locateItems);
  commitIngredients.mockReset();
  db.from.mockReset();
  db.rpc.mockReset();
});

describe("analyzePlace", () => {
  it("sends the photo and the place to the AI, matches every item in one call and returns the suggestions for the place", async () => {
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });

    const [input] = analyzeImage.mock.calls[0];
    expect(input).toEqual({ image: kyl, place: "Kyl" });
    expect(matchIngredients).toHaveBeenCalledTimes(1);
    expect(matchIngredients.mock.calls[0][0]).toEqual(fixture.map((item) => ({ text: item.label, hint: item.hint })));
    expect(getIngredientNames).toHaveBeenCalledWith([mjolk, smor]);
    expect(listPantryIn.mock.calls[0][1]).toBe("Kyl");

    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.location).toBe("Kyl");
    expect(result.data.suggestions.map(({ name, amount, unit }) => [name, amount, unit])).toEqual([
      ["grädde", 1, "förp"],
      ["gurka", 2, "st"],
      ["ketchup", null, null],
      ["Mjölk", 1, "förp"],
      // Unlimited at home stays unlimited.
      ["Smör", null, null],
      ["ägg", 6, "st"],
    ]);
    expect(result.data.suggestions[3]).toMatchObject({
      ingredient: { kind: "existing", ingredientId: mjolk },
      current: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
    });
    expect(result.data.dropped).toBe(0);
    expect(result.data.suggestions[0].ingredient).toEqual({
      kind: "new",
      proposalId: "n1",
      name: "grädde",
      section: "Övrigt",
      location: "Kyl",
      defaultUnit: null,
    });
  });

  it("gives the items in reading order and each suggestion the numbers of its items in it (Story 6.6)", async () => {
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.reading).toEqual(["Mellanmjölk 1,5 %", "Vispgrädde 3 dl", "Smör 500 g", "Ägg", "Gurka", "Ketchup"]);
    expect(result.data.suggestions.map(({ name, itemNumbers }) => [name, itemNumbers])).toEqual([
      ["grädde", [2]],
      ["gurka", [5]],
      ["ketchup", [6]],
      ["Mjölk", [1]],
      ["Smör", [3]],
      ["ägg", [4]],
    ]);
  });

  it("puts each label of the reading on one line, and gives an item with nothing left of its label the word vara", async () => {
    const [first, second] = fixture;
    analyzeImage.mockResolvedValueOnce(answer([{ ...first, label: "Arla\nmellanmjölk\t1,5 l" }, { ...second, label: "\u200b" }]));
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    expect(result.ok && result.data.reading).toEqual(["Arla mellanmjölk 1,5 l", "vara"]);
  });

  it("never writes: no catalog commit and no use of the session client beyond the stubbed reads", async () => {
    expect((await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).ok).toBe(true);
    expect(commitIngredients).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("links items to the catalog only through matchIngredients, never from the model", async () => {
    matchIngredients.mockImplementation(async (items) => items.map((): IngredientMatch => ({ kind: "unmatched" })));
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    // Items were seen but none could be used: counted, so the client can say so.
    expect(result).toMatchObject(ok({ location: "Kyl", suggestions: [], dropped: 6 }));
    // Nothing the AI named could be linked, so the place's items are not seen, and the comparison says it is incomplete.
    expect(result.ok && result.data.inventory).toMatchObject({
      kind: "compared",
      incomplete: true,
      missing: [{ name: "Mjölk" }, { name: "Smör" }],
    });
    expect(getIngredientNames).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith("analyze_items_dropped", { unmatched: 6, unnamed: 0, unusable: 0, invalid: 0 });
  });

  it("gives an empty list for a photo without food, without asking the catalog, compared with an empty place", async () => {
    listPantryIn.mockResolvedValueOnce([]);
    const result = await analyzePlace({ image: photo("tom-hylla.png"), location: "Frys" }, { signal: signal() });
    expect(result).toEqual(ok({ location: "Frys", suggestions: [], dropped: 0, inventory: { kind: "empty" }, reading: [] }));
    expect(matchIngredients).not.toHaveBeenCalled();
    expect(getIngredientNames).not.toHaveBeenCalled();
  });

  it("puts every item of a place with items under Syns inte längre for a photo without food, as incomplete", async () => {
    const result = await analyzePlace({ image: photo("tom-hylla.png"), location: "Kyl" }, { signal: signal() });
    expect(result.ok && result.data.suggestions).toEqual([]);
    expect(result.ok && result.data.inventory).toMatchObject({
      kind: "compared",
      incomplete: true,
      missing: [{ name: "Mjölk" }, { name: "Smör" }],
    });
    expect(matchIngredients).not.toHaveBeenCalled();
  });

  it("gives unauthorized without asking the AI", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).toEqual(fail("unauthorized"));
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it.each(["ai_unavailable", "ai_invalid", "ai_rejected"] as const)("passes on %s from the AI port", async (code) => {
    expect(await analyzePlace({ image: photo(`reserved-${code}.png`), location: "Kyl" }, { signal: signal() })).toEqual(fail(code));
    expect(matchIngredients).not.toHaveBeenCalled();
  });

  it("passes on validation for an image outside the port's limits", async () => {
    const image = { data: new Uint8Array([1]), mediaType: "image/gif" };
    expect(await analyzePlace({ image, location: "Kyl" }, { signal: signal() })).toEqual(fail("validation"));
  });

  it("gives catalog_unavailable when the matching or the names fail", async () => {
    matchIngredients.mockRejectedValueOnce(new CatalogDataError("query_failed"));
    expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
    expect(console.error).toHaveBeenCalledWith("catalog_unavailable", { reason: "query_failed" });

    getIngredientNames.mockRejectedValueOnce(new CatalogDataError("query_failed"));
    expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
  });

  it("throws other errors from the catalog, which are bugs", async () => {
    matchIngredients.mockRejectedValueOnce(new TypeError("bug"));
    await expect(analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).rejects.toThrow("bug");
  });

  it.each([
    ["the pantry", () => new PantryDataError("query_failed 500"), { reason: "query_failed 500" }],
    ["the pantry's names", () => new CatalogDataError("query_failed"), { reason: "catalog_query_failed" }],
  ])("shows the suggestions without what the place has when %s cannot be read", async (_name, error, logged) => {
    listPantryIn.mockRejectedValueOnce(error());
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.suggestions).toHaveLength(6);
    expect(result.data.suggestions.every((suggestion) => suggestion.current === null)).toBe(true);
    // Smör is no longer known to be unlimited at home: it keeps the photo's amount.
    expect(result.data.suggestions.find(({ name }) => name === "Smör")).toMatchObject({ amount: 1, unit: "förp" });
    expect(console.error).toHaveBeenCalledWith("pantry_unavailable", logged);
  });

  describe("compared with the place (Story 6.4)", () => {
    const yoghurt = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a03";
    const yoghurtRow: PantryItem = {
      id: "7a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a03",
      siteId: hemma,
      ingredientId: yoghurt,
      name: "Yoghurt",
      location: "Kyl",
      amount: 2,
      unit: "förp",
    };

    it("groups the suggestions against the place's items, with the AI call unchanged, and writes nothing", async () => {
      listPantryIn.mockResolvedValueOnce([...atHome, yoghurtRow]);
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      if (!result.ok) throw new Error(result.error.code);
      // The AI port gets the same input as before the comparison: the photo and the place, nothing about the pantry.
      expect(analyzeImage).toHaveBeenCalledTimes(1);
      expect(analyzeImage.mock.calls[0][0]).toEqual({ image: kyl, place: "Kyl" });
      expect(result.data.suggestions.map(({ name, change }) => [name, change])).toEqual([
        ["grädde", "new"],
        ["gurka", "new"],
        ["ketchup", "new"],
        ["Mjölk", "changed"],
        ["Smör", "unchanged"],
        ["ägg", "new"],
      ]);
      // grädde, gurka, ketchup and ägg are new catalog ingredients: maybe an item of the fridge under another name.
      expect(result.data.inventory).toEqual({
        kind: "compared",
        incomplete: true,
        missing: [
          {
            id: "missing:m1",
            ingredientId: yoghurt,
            name: "Yoghurt",
            location: "Kyl",
            rows: [{ id: yoghurtRow.id, amount: 2, unit: "förp" }],
            stock: { unlimited: false, amounts: [{ amount: 2, unit: "förp" }] },
          },
        ],
      });
      expect(commitIngredients).not.toHaveBeenCalled();
      expect(db.from).not.toHaveBeenCalled();
      expect(db.rpc).not.toHaveBeenCalled();
    });

    it("is empty for a place without items: the suggestions as in 6.1 and 6.2", async () => {
      listPantryIn.mockResolvedValueOnce([]);
      const result = await analyzePlace({ image: kyl, location: "Frys" }, { signal: signal() });
      if (!result.ok) throw new Error(result.error.code);
      expect(result.data.inventory).toEqual({ kind: "empty" });
      expect(result.data.suggestions.every(({ change, replaces }) => change === null && replaces.length === 0)).toBe(true);
    });

    it("is unread when the place cannot be read (and when its read is skipped near the deadline, below)", async () => {
      listPantryIn.mockRejectedValueOnce(new PantryDataError("query_failed 500"));
      const failed = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      expect(failed.ok && failed.data.inventory).toEqual({ kind: "unread" });
    });

    it("never offers to remove an ingredient the AI named, also when its suggestion was left out (unnamed)", async () => {
      getIngredientNames.mockResolvedValueOnce({ [smor]: "Smör" });
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      if (!result.ok) throw new Error(result.error.code);
      expect(result.data.suggestions.map(({ name }) => name)).not.toContain("Mjölk");
      // Mjölk is in the fridge and was seen: not "Syns inte längre". Something was left out: incomplete.
      expect(result.data.inventory).toEqual({ kind: "compared", incomplete: true, missing: [] });
    });

    it("is complete when every item is a known ingredient and nothing was dropped or cut, also for 25 items", async () => {
      analyzeImage.mockResolvedValueOnce(answer([fixture[0], fixture[2]]));
      const known2 = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      expect(known2.ok && known2.data.inventory).toMatchObject({ kind: "compared", incomplete: false });

      const many = Array.from({ length: 30 }, () => fixture[2]);
      analyzeImage.mockResolvedValueOnce(answer(many));
      const cut = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      expect(cut.ok && cut.data.inventory).toMatchObject({ kind: "compared", incomplete: true });
    });

    it("is incomplete when the AI repeated a label in a loop, and logs the count (Story 6.5)", async () => {
      analyzeImage.mockResolvedValueOnce(answer([fixture[0], fixture[2]], 0, 2));
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      expect(result.ok && result.data.inventory).toMatchObject({ kind: "compared", incomplete: true });
      expect(console.info).toHaveBeenCalledWith("analyze_items_repeated", { count: 2 });
    });

    it("stays complete for a single duplicate, which the port only merged (Story 6.5)", async () => {
      analyzeImage.mockResolvedValueOnce(answer([fixture[0], fixture[2]], 0, 1));
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      expect(result.ok && result.data.inventory).toMatchObject({ kind: "compared", incomplete: false });
    });

    it("never offers to remove an ingredient the AI was unsure of, and shows it as a card (Story 6.5)", async () => {
      const senap = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a09";
      matchIngredients.mockImplementationOnce(async (items) =>
        items.map((item): IngredientMatch =>
          item.hint?.name === "senap" ? { kind: "match", ingredientId: senap, confidence: "hint" } : matchByHint([item])[0],
        ),
      );
      getIngredientNames.mockResolvedValueOnce({ [senap]: "senap" });
      listPantryIn.mockResolvedValueOnce([
        { id: "7a1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a09", siteId: hemma, ingredientId: senap, name: "senap", location: "Kyl", amount: 1, unit: "förp" },
      ]);
      const result = await analyzePlace({ image: photo("kyl-dorr.png"), location: "Kyl" }, { signal: signal() });
      if (!result.ok) throw new Error(result.error.code);
      expect(result.data.inventory).toMatchObject({ kind: "compared", missing: [] });
      expect(result.data.suggestions.find(({ name }) => name === "senap")).toMatchObject({ uncertain: true, change: "changed", replaces: [] });
    });

    it("leaves out a comparison the client could not read, never the whole answer", async () => {
      listPantryIn.mockResolvedValueOnce([...atHome, { ...yoghurtRow, id: "not-a-uuid" }]);
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      if (!result.ok) throw new Error(result.error.code);
      expect(result.data.inventory).toEqual({ kind: "unread" });
      expect(result.data.reading).toHaveLength(6);
      expect(analyzeResultSchema.safeParse(result.data).success).toBe(true);
      expect(result.data.suggestions).toHaveLength(6);
      expect(result.data.suggestions.every(({ change, replaces }) => change === null && replaces.length === 0)).toBe(true);
      expect(console.error).toHaveBeenCalledWith("analyze_inventory_invalid");
    });
  });

  it("throws other errors from the pantry, which are bugs", async () => {
    listPantryIn.mockRejectedValueOnce(new TypeError("bug"));
    await expect(analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).rejects.toThrow("bug");
  });

  it("keeps as many items as the AI port's prompt asks for", () => {
    expect(maxPantrySuggestions).toBe(inputLimits.analyze.maxItems);
  });

  it("keeps the AI's first 25 items, and logs how many were left out", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...fixture[3], label: `Vara ${index}`, hint: { ...fixture[3].hint, name: `vara ${index}` } }));
    analyzeImage.mockResolvedValueOnce(answer(many));
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    expect(matchIngredients.mock.calls[0][0]).toHaveLength(25);
    expect(matchIngredients.mock.calls[0][0][24].text).toBe("Vara 24");
    expect(result.ok && result.data.suggestions).toHaveLength(25);
    expect(console.info).toHaveBeenCalledWith("analyze_items_trimmed", { dropped: 5 });
  });

  it("gives the reading of exactly the 25 items kept, and an answer the client's schema takes (Story 6.6)", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...fixture[3], label: `Vara ${index}`, hint: { ...fixture[3].hint, name: `vara ${index}` } }));
    analyzeImage.mockResolvedValueOnce(answer(many));
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.reading).toHaveLength(25);
    expect(result.data.reading?.at(-1)).toBe("Vara 24");
    expect(analyzeResultSchema.safeParse(result.data).success).toBe(true);
    expect(Math.max(...result.data.suggestions.flatMap(({ itemNumbers }) => itemNumbers ?? []))).toBe(25);
  });

  it("counts the items the AI port left out as invalid, with the ones the catalog could not use", async () => {
    analyzeImage.mockResolvedValueOnce(answer([fixture[0], fixture[2]], 3));
    getIngredientNames.mockResolvedValueOnce({ [smor]: "Smör" });
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    // Mjölk is linked, but its name is gone from the catalog.
    expect(result.data.suggestions.map(({ name }) => name)).toEqual(["Smör"]);
    expect(result.data.dropped).toBe(4);
    expect(console.info).toHaveBeenCalledWith("analyze_items_dropped", { unmatched: 0, unnamed: 1, unusable: 0, invalid: 3 });
  });

  it("counts invalid items also when none is left", async () => {
    analyzeImage.mockResolvedValueOnce(answer([], 2));
    expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).toEqual(
      ok({
        location: "Kyl",
        suggestions: [],
        dropped: 2,
        inventory: expect.objectContaining({ kind: "compared", incomplete: true }),
        reading: [],
      }),
    );
    expect(matchIngredients).not.toHaveBeenCalled();
  });

  it("checks every suggestion against the client's schema and leaves out one that does not pass, logging a count", async () => {
    getIngredientNames.mockResolvedValueOnce({ [mjolk]: " ", [smor]: "Smör" });
    const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.suggestions.map(({ name }) => name)).not.toContain(" ");
    expect(result.data.suggestions).toHaveLength(5);
    expect(result.data.dropped).toBe(1);
    expect(console.error).toHaveBeenCalledWith("analyze_output_invalid", { count: 1 });
  });

  it("gives each suggestion the AI's labels and marks the ones it was unsure of (Story 6.5)", async () => {
    listPantryIn.mockResolvedValueOnce([]);
    const result = await analyzePlace({ image: photo("kyl-dorr.png"), location: "Kyl" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    // The mock merged the repeated cream, as the port does: three suggestions, not six.
    expect(result.data.suggestions.map(({ name, labels, uncertain }) => [name, labels, uncertain])).toEqual([
      ["apelsinjuice", ["Solgården apelsinjuice 1 l"], false],
      ["senap", ["Gul flaska, troligen senap"], true],
      ["vispgrädde", ["Lantmejeriet vispgrädde 36 % 3 dl"], false],
    ]);
    expect(result.data.suggestions.find(({ name }) => name === "vispgrädde")).toMatchObject({ amount: 1, unit: "förp" });
  });

  it("logs codes and counts only, never the photo, the items or the names", async () => {
    listPantryIn.mockRejectedValueOnce(new PantryDataError("query_failed 500"));
    const many = Array.from({ length: 26 }, () => fixture[0]);
    analyzeImage.mockResolvedValueOnce(answer(many, 1));
    await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.info).mock.calls]);
    expect(logged).not.toMatch(/mjölk|Mellanmjölk|grädde/i);
    expect(logged).not.toContain("data");
  });

  it("gives the model the time left before the deadline, but a margin for the reads after it", async () => {
    const deadline = Date.now() + 120_000;
    await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal(), deadline });
    expect(analyzeImage.mock.calls[0][2]).toEqual({ deadline: deadline - postModelMarginMs });
    await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
    expect(analyzeImage.mock.calls[1][2]).toEqual({ deadline: undefined });
  });

  describe("near the deadline", () => {
    /** The AI answers when only `left` ms are left before the deadline. */
    function answerWithLeft(left: number) {
      const deadline = Date.now() + 60_000;
      analyzeImage.mockImplementationOnce(async (input: AnalyzeImageInput, aiSignal: AbortSignal) => {
        vi.setSystemTime(deadline - left);
        return ai.analyzeImage(input, aiSignal);
      });
      return deadline;
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("gives ai_unavailable without matching when too little time is left after the AI", async () => {
      const deadline = answerWithLeft(minReadMs - 1);
      expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal(), deadline })).toEqual(fail("ai_unavailable"));
      expect(matchIngredients).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("ai_unavailable", { reason: "deadline" });
    });

    it("skips what the place has, and still gives the suggestions, when the time runs short after the names", async () => {
      const deadline = answerWithLeft(60_000);
      getIngredientNames.mockImplementationOnce(async () => {
        vi.setSystemTime(deadline - minReadMs + 1);
        return catalogNames;
      });
      const result = await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal(), deadline });
      if (!result.ok) throw new Error(result.error.code);
      expect(result.data.suggestions).toHaveLength(6);
      expect(result.data.suggestions.every((suggestion) => suggestion.current === null)).toBe(true);
      expect(listPantryIn).not.toHaveBeenCalled();
      expect(result.data.inventory).toEqual({ kind: "unread" });
      expect(console.info).toHaveBeenCalledWith("analyze_place_skipped", { reason: "deadline" });
    });
  });

  describe("a request that goes away", () => {
    it("reaches the mock as aborted while the AI is asked", async () => {
      const controller = new AbortController();
      let seen: AbortSignal | undefined;
      analyzeImage.mockImplementationOnce(async (input: AnalyzeImageInput, aiSignal: AbortSignal, options?: RunOptions) => {
        seen = aiSignal;
        controller.abort();
        return ai.analyzeImage(input, aiSignal, options);
      });
      expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(seen?.aborted).toBe(true);
      expect(matchIngredients).not.toHaveBeenCalled();
    });

    it("stops after the AI answers, without matching", async () => {
      const controller = new AbortController();
      analyzeImage.mockImplementationOnce(async (input: AnalyzeImageInput, aiSignal: AbortSignal) => {
        const answer = await ai.analyzeImage(input, aiSignal);
        controller.abort();
        return answer;
      });
      expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(matchIngredients).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith("analyze_aborted");
    });

    it("stops after the matching, before the names and the pantry are read", async () => {
      const controller = new AbortController();
      matchIngredients.mockImplementationOnce(async (items) => {
        controller.abort();
        return matchByHint(items);
      });
      expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(getIngredientNames).not.toHaveBeenCalled();
      expect(listPantryIn).not.toHaveBeenCalled();
    });

    it("stops after the names, before the pantry is read", async () => {
      const controller = new AbortController();
      getIngredientNames.mockImplementationOnce(async () => {
        controller.abort();
        return catalogNames;
      });
      expect(await analyzePlace({ image: kyl, location: "Kyl" }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(listPantryIn).not.toHaveBeenCalled();
    });
  });

  describe("one analysis per user", () => {
    /** Holds the AI call until `release`, so a second request comes while it runs. */
    function holdAi() {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const signals: AbortSignal[] = [];
      analyzeImage.mockImplementationOnce(async (input: AnalyzeImageInput, aiSignal: AbortSignal, options?: RunOptions) => {
        signals.push(aiSignal);
        await held;
        return ai.analyzeImage(input, aiSignal, options);
      });
      return { release, signals };
    }

    it("stops the earlier analysis when the same user sends another photo, which answers ai_superseded", async () => {
      const first = holdAi();
      const running = analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));

      expect((await analyzePlace({ image: kyl, location: "Frys" }, { signal: signal() })).ok).toBe(true);
      expect(first.signals[0].aborted).toBe(true);
      first.release();
      expect(await running).toEqual(fail("ai_superseded"));
      expect(console.info).toHaveBeenCalledWith("analyze_superseded");
    });

    it("answers ai_unavailable, not ai_superseded, when the request itself went away", async () => {
      const first = holdAi();
      const controller = new AbortController();
      const running = analyzePlace({ image: kyl, location: "Kyl" }, { signal: controller.signal });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));
      controller.abort();
      first.release();
      expect(await running).toEqual(fail("ai_unavailable"));
    });

    it("leaves another user's analysis alone", async () => {
      const first = holdAi();
      const running = analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));

      requireUser.mockResolvedValueOnce(user("someone-else"));
      expect((await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).ok).toBe(true);
      expect(first.signals[0].aborted).toBe(false);
      first.release();
      expect((await running).ok).toBe(true);
    });

    // Story 6.6: the lookup of the numbers shares the lock, and gives way to an analysis.
    const labels = ["Mellanmjölk 1,5 %", "Vispgrädde 3 dl"];

    it("stops a lookup of the numbers on its way when the same user sends a photo", async () => {
      const lookupSignals: AbortSignal[] = [];
      locateItems.mockImplementationOnce(
        (_input, lookupSignal) =>
          new Promise((resolve) => {
            lookupSignals.push(lookupSignal);
            lookupSignal.addEventListener("abort", () => resolve(fail("ai_unavailable")), { once: true });
          }),
      );
      const lookup = locatePlaceItems({ image: kyl, labels }, { signal: signal() });
      await vi.waitFor(() => expect(lookupSignals).toHaveLength(1));

      expect((await analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() })).ok).toBe(true);
      expect(lookupSignals[0].aborted).toBe(true);
      expect(await lookup).toEqual(fail("ai_superseded"));
    });

    it("answers a lookup during an analysis ai_superseded at once, without the AI, and the analysis goes on", async () => {
      const first = holdAi();
      const running = analyzePlace({ image: kyl, location: "Kyl" }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));

      expect(await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).toEqual(fail("ai_superseded"));
      expect(locateItems).not.toHaveBeenCalled();
      expect(first.signals[0].aborted).toBe(false);
      first.release();
      expect((await running).ok).toBe(true);
      // Once the analysis is done, the lookup runs.
      expect((await locatePlaceItems({ image: kyl, labels }, { signal: signal() })).ok).toBe(true);
    });
  });
});
