import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, MatchItem } from "@/features/catalog";
import type { PantrySnapshot, PantryStock } from "@/features/pantry";
import { fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";
import { fromCompactDish } from "@/server/ai/compact-dish";
import { suggestDishesAnswerCompact } from "@/server/ai/schemas";
import { isValidSuggestDishesInput, withInputValidation, type SuggestDishesInput, type SuggestDishesOptions } from "@/server/ai/service";
import { toSuggestInput } from "../domain/pantry-input";

// suggestFromPantry with the AI port's mock (tests/fixtures/ai, behind the
// port's input check, as with AI_PROVIDER=mock) and stubbed user, pantry and
// catalog modules.

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
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  matchIngredients: (items: readonly MatchItem[]) => matchIngredients(items),
  getIngredientNames: (ids: readonly string[]) => getIngredientNames(ids),
}));
const getPantrySnapshot = vi.fn<(siteId?: string) => Promise<PantrySnapshot>>();
/** The selected place. */
const stugan = { id: "55555555-5555-4555-8555-555555555555", name: "Stugan", siteCount: 2 };
// pantry.getPantryForStatus as pantry/server.test.ts shows it: the selected
// place, then that place's pantry, and neither when one cannot be read.
vi.mock("@/features/pantry/server", () => ({
  getPantryForStatus: async () => {
    try {
      return { site: stugan, snapshot: await getPantrySnapshot(stugan.id) };
    } catch (error) {
      if (!(error instanceof PantryDataError)) throw error;
      console.error("pantry_unavailable", { reason: error.detail });
      return { site: null, snapshot: null };
    }
  },
}));

// Story 9.5: the selected store and its offers.
const { SettingsDataError, OffersDataError } = vi.hoisted(() => ({
  SettingsDataError: class SettingsDataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
  OffersDataError: class OffersDataError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
}));
const getSelectedStore = vi.fn<() => Promise<{ id: string } | null>>();
const getActiveOffers = vi.fn<(storeId: string) => Promise<unknown[]>>();
const listStores = vi.fn<() => Promise<{ id: string }[]>>();
vi.mock("@/features/settings/server", () => ({ SettingsDataError, getSelectedStore: () => getSelectedStore(), listStores: () => listStores() }));
vi.mock("@/features/offers/server", () => ({ OffersDataError, getActiveOffers: (storeId: string) => getActiveOffers(storeId) }));

const ai = withInputValidation(createMockAiService());
const suggestDishes = vi.fn(ai.suggestDishes);
vi.mock("@/server/ai", () => ({ getAiService: () => ({ suggestDishes }) }));

const { checkSuggestPantry, suggestFromPantry, postModelMarginMs } = await import("./suggest-from-pantry");

const fixture = suggestDishesAnswerCompact.parse(
  JSON.parse(readFileSync(new URL("../../../../tests/fixtures/ai/suggest-dishes.response.json", import.meta.url), "utf8")),
).suggestions.map(fromCompactDish);
const lineCount = fixture.reduce((sum, recipe) => sum + recipe.ingredients.length, 0);

const id = (n: number) => `6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a0${n}`;
const ids = { lok: id(1), gradde: id(2), vitlok: id(3), ost: id(4), salt: id(5) };
const catalogNames: Record<string, string> = {
  [ids.lok]: "Gul lök",
  [ids.gradde]: "Grädde",
  [ids.vitlok]: "Vitlök",
  [ids.ost]: "Riven ost",
  [ids.salt]: "Salt",
};
/** At home: lök, grädde, vitlök, riven ost and salt. Each fixture dish uses at least two of the first four. */
const pantry: PantrySnapshot = new Map([
  [ids.lok, { unlimited: false, amounts: [{ unit: "st", amount: 3 }] }],
  [ids.gradde, { unlimited: false, amounts: [{ unit: "dl", amount: 3 }] }],
  [ids.vitlok, { unlimited: false, amounts: [{ unit: "klyfta", amount: 6 }] }],
  [ids.ost, { unlimited: false, amounts: [{ unit: "g", amount: 200 }] }],
  [ids.salt, { unlimited: true, amounts: [] }],
]);
/** The catalog knows these by the AI's name; everything else is new. */
const known: Record<string, string> = { "gul lök": ids.lok, grädde: ids.gradde, vitlök: ids.vitlok, "riven ost": ids.ost };
const signal = () => new AbortController().signal;
const user = (userId = "user") => ok({ id: userId, email: "pontus@example.com" });

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  requireUser.mockReset().mockResolvedValue(user());
  getPantrySnapshot.mockReset().mockResolvedValue(pantry);
  getIngredientNames.mockReset().mockImplementation(async (wanted) =>
    Object.fromEntries(wanted.flatMap((wantedId) => (catalogNames[wantedId] ? [[wantedId, catalogNames[wantedId]]] : []))),
  );
  matchIngredients.mockReset().mockImplementation(async (items) =>
    items.map((item): IngredientMatch => {
      const matched = item.hint ? known[item.hint.name] : undefined;
      return matched
        ? { kind: "match", ingredientId: matched, confidence: "hint" }
        : { kind: "new", proposal: { name: item.hint?.name ?? item.text, section: "Övrigt", location: "Skafferi", defaultUnit: null } };
    }),
  );
  suggestDishes.mockReset().mockImplementation(ai.suggestDishes);
  getSelectedStore.mockReset().mockResolvedValue({ id: "store" });
  listStores.mockReset().mockResolvedValue([{ id: "store" }, { id: "krokom" }]);
  getActiveOffers.mockReset().mockResolvedValue([]);
});

describe("suggestFromPantry", () => {
  it("sends the pantry by name, matches every line in one call and returns three AI drafts with the matched names", async () => {
    const result = await suggestFromPantry({ avoidTitles: ["Pannkakor"] }, { signal: signal() });

    expect(getIngredientNames.mock.calls[0][0]).toEqual(Object.values(ids));
    const [input] = suggestDishes.mock.calls[0];
    expect(input).toEqual({
      pantry: [
        { name: "Grädde", amount: 3, unit: "dl" },
        { name: "Gul lök", amount: 3, unit: "st" },
        { name: "Riven ost", amount: 200, unit: "g" },
        { name: "Salt", amount: null, unit: null },
        { name: "Vitlök", amount: 6, unit: "klyfta" },
      ],
      avoidTitles: ["Pannkakor"],
    });
    // The model never sees an id.
    expect(JSON.stringify(input)).not.toMatch(/6f1c1b7e/);

    expect(matchIngredients).toHaveBeenCalledTimes(1);
    expect(matchIngredients.mock.calls[0][0]).toHaveLength(lineCount);
    expect(matchIngredients.mock.calls[0][0][0]).toEqual({
      text: fixture[0].ingredients[0].originalText,
      hint: fixture[0].ingredients[0].hint,
    });

    if (!result.ok) throw new Error(result.error.code);
    const { suggestions } = result.data;
    expect(suggestions.map(({ draft }) => draft.title)).toEqual(fixture.map((recipe) => recipe.title));
    for (const [index, { draft }] of suggestions.entries()) {
      expect(draft).toMatchObject({ sourceKind: "ai", sourceUrl: null, imageUrl: null });
      expect(draft.lines).toHaveLength(fixture[index].ingredients.length);
    }
    // Each suggestion's lines got their own matches, in order.
    const gryta = suggestions[0].draft;
    expect(gryta.lines[1]).toMatchObject({ originalText: "1 gul lök", ingredient: { kind: "match", ingredientId: ids.lok } });
    expect(gryta.lines[0].ingredient).toMatchObject({ kind: "new", proposal: { name: "kycklingfilé" } });
    // Names only for each draft's own links.
    expect(suggestions[0].ingredientNames).toEqual({ [ids.lok]: "Gul lök", [ids.vitlok]: "Vitlök", [ids.gradde]: "Grädde" });
    expect(suggestions[2].ingredientNames).toEqual({ [ids.lok]: "Gul lök", [ids.ost]: "Riven ost" });
  });

  it("reads the selected place's pantry as the library does, and says which place the dishes are from (AD-24)", async () => {
    const result = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    expect(getPantrySnapshot).toHaveBeenCalledTimes(1);
    expect(getPantrySnapshot).toHaveBeenCalledWith(stugan.id);
    expect(result.ok && result.data.siteId).toBe(stugan.id);
  });

  it("gives unauthorized without reading anything", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("unauthorized"));
    expect(getPantrySnapshot).not.toHaveBeenCalled();
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives pantry_unavailable without asking the AI when the pantry cannot be read", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("connection"));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("pantry_unavailable"));
    expect(console.error).toHaveBeenCalledWith("pantry_unavailable", { reason: "connection" });
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("throws other errors from the pantry, which are bugs", async () => {
    getPantrySnapshot.mockRejectedValue(new TypeError("bug"));
    await expect(suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).rejects.toThrow("bug");
  });

  it("gives suggest_empty_pantry without asking the AI when nothing is at home, also on an empty place such as Stugan", async () => {
    getPantrySnapshot.mockResolvedValue(new Map());
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("suggest_empty_pantry"));
    expect(getIngredientNames).not.toHaveBeenCalled();
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives catalog_unavailable, not an empty pantry, when nothing at home can be named", async () => {
    getIngredientNames.mockResolvedValue({});
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
    expect(console.error).toHaveBeenCalledWith("catalog_unavailable", { reason: "no_names" });
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives catalog_unavailable without asking the AI when the pantry's names cannot be read", async () => {
    getIngredientNames.mockRejectedValue(new CatalogDataError("query"));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives catalog_unavailable when the matching or the matched names fail", async () => {
    matchIngredients.mockRejectedValueOnce(new CatalogDataError("query"));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("catalog_unavailable"));

    getIngredientNames.mockImplementationOnce(async () => ({ ...catalogNames })).mockRejectedValueOnce(new CatalogDataError("query"));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
  });

  it.each(["ai_unavailable", "ai_invalid", "ai_rejected"] as const)("passes on %s from the AI port", async (code) => {
    getPantrySnapshot.mockResolvedValue(new Map([...pantry, ["reserved", { unlimited: true, amounts: [] }]]));
    getIngredientNames.mockResolvedValueOnce({ ...catalogNames, reserved: `matkoll-mock: ${code}` });
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail(code));
    expect(matchIngredients).not.toHaveBeenCalled();
  });

  it("leaves out a draft that does not pass recipeDraftSchema, logging only paths and codes, and the later one keeps its own matches", async () => {
    const [first, second, third] = fixture;
    const tooLong = { ...second, title: `${"x".repeat(201)} hemligt` };
    suggestDishes.mockResolvedValueOnce(ok([first, tooLong, third]));
    const result = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);

    expect(result.data.suggestions.map(({ draft }) => draft.title)).toEqual([first.title, third.title]);
    expect(console.error).toHaveBeenCalledWith("ai_invalid", {
      reason: "draft",
      index: 1,
      issues: [{ path: ["title"], code: "too_big" }],
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("hemligt");
    // The omelett, after the dropped pasta, has its own lines and names.
    const omelett = result.data.suggestions[1];
    expect(omelett.draft.lines.map((line) => line.originalText)).toEqual(third.ingredients.map((line) => line.originalText));
    expect(omelett.draft.lines[3]).toMatchObject({ originalText: "1 gul lök", ingredient: { kind: "match", ingredientId: ids.lok } });
    expect(omelett.draft.lines[4]).toMatchObject({ originalText: "1 dl riven ost", ingredient: { kind: "match", ingredientId: ids.ost } });
    expect(omelett.ingredientNames).toEqual({ [ids.lok]: "Gul lök", [ids.ost]: "Riven ost" });
  });

  it("leaves out a draft that uses fewer than two ingredients at home, logging the index and count only", async () => {
    // Without riven ost at home the omelett uses only gul lök.
    getPantrySnapshot.mockResolvedValue(new Map([...pantry].filter(([key]) => key !== ids.ost)));
    const result = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.suggestions.map(({ draft }) => draft.title)).toEqual([fixture[0].title, fixture[1].title]);
    expect(console.error).toHaveBeenCalledWith("ai_invalid", { reason: "pantry", index: 2, count: 1 });
  });

  it("gives ai_invalid when no draft passes", async () => {
    suggestDishes.mockResolvedValueOnce(ok(fixture.map((recipe) => ({ ...recipe, title: "x".repeat(201) }))));
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("ai_invalid"));
  });

  it("links lines to the catalog only through matchIngredients, never from the model", async () => {
    matchIngredients.mockImplementation(async (items) => items.map((): IngredientMatch => ({ kind: "unmatched" })));
    // Nothing is linked, so nothing uses the pantry: every draft is left out.
    expect(await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).toEqual(fail("ai_invalid"));
    expect(console.error).toHaveBeenCalledWith("ai_invalid", { reason: "pantry", index: 0, count: 0 });
  });

  it("sends at most what the AI port takes, and logs how many entries were left out", async () => {
    const big: PantrySnapshot = new Map([
      ...pantry,
      ...Array.from(
        { length: 150 },
        (_, index): [string, PantryStock] => [`id-${index}`, { unlimited: false, amounts: [{ unit: "st", amount: 1 }] }],
      ),
    ]);
    getPantrySnapshot.mockResolvedValue(big);
    getIngredientNames.mockResolvedValueOnce({
      ...catalogNames,
      ...Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`id-${index}`, `vara ${String(index).padStart(3, "0")}`])),
    });
    const result = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    expect(result.ok).toBe(true);
    const sent = suggestDishes.mock.calls[0][0];
    expect(isValidSuggestDishesInput(sent)).toBe(true);
    expect(console.info).toHaveBeenCalledWith("suggest_pantry_trimmed", { dropped: 155 - sent.pantry.length });
  });

  it("gives the model the time left before the deadline, but a margin for the reads after it", async () => {
    const deadline = Date.now() + 120_000;
    await suggestFromPantry({ avoidTitles: [] }, { signal: signal(), deadline });
    expect(suggestDishes.mock.calls[0][2]).toEqual({ deadline: deadline - postModelMarginMs });
    await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    expect(suggestDishes.mock.calls[1][2]).toEqual({ deadline: undefined });
  });

  describe("a request that goes away", () => {
    it("stops after the pantry is read, without asking the AI", async () => {
      const controller = new AbortController();
      getPantrySnapshot.mockImplementationOnce(async () => {
        controller.abort();
        return pantry;
      });
      expect(await suggestFromPantry({ avoidTitles: [] }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(suggestDishes).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalledWith("suggest_aborted");
    });

    it("reaches the mock as aborted while the AI is asked", async () => {
      const controller = new AbortController();
      let seen: AbortSignal | undefined;
      suggestDishes.mockImplementationOnce(async (input: SuggestDishesInput, aiSignal: AbortSignal, options?: SuggestDishesOptions) => {
        seen = aiSignal;
        controller.abort();
        return ai.suggestDishes(input, aiSignal, options);
      });
      expect(await suggestFromPantry({ avoidTitles: [] }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(seen?.aborted).toBe(true);
      expect(matchIngredients).not.toHaveBeenCalled();
    });

    it("stops after the AI answers, without matching", async () => {
      const controller = new AbortController();
      suggestDishes.mockImplementationOnce(async (input: SuggestDishesInput, aiSignal: AbortSignal) => {
        const answer = await ai.suggestDishes(input, aiSignal);
        controller.abort();
        return answer;
      });
      expect(await suggestFromPantry({ avoidTitles: [] }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      expect(matchIngredients).not.toHaveBeenCalled();
    });

    it("stops before the matched names are read", async () => {
      const controller = new AbortController();
      matchIngredients.mockImplementationOnce(async (items) => {
        controller.abort();
        return items.map((item): IngredientMatch => {
          const matched = item.hint ? known[item.hint.name] : undefined;
          return matched ? { kind: "match", ingredientId: matched, confidence: "hint" } : { kind: "unmatched" };
        });
      });
      expect(await suggestFromPantry({ avoidTitles: [] }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
      // Only the pantry's names were read.
      expect(getIngredientNames).toHaveBeenCalledTimes(1);
    });
  });
  describe("as the work of an AI job (Story 12.4)", () => {
    it("keeps no lock of its own: the queue lets one job run at a time, and a run never stops another", async () => {
      let release = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const signals: AbortSignal[] = [];
      suggestDishes.mockImplementationOnce(async (input: SuggestDishesInput, aiSignal: AbortSignal, options?: SuggestDishesOptions) => {
        signals.push(aiSignal);
        await held;
        return ai.suggestDishes(input, aiSignal, options);
      });
      const running = suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      await vi.waitFor(() => expect(signals).toHaveLength(1));

      expect((await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).ok).toBe(true);
      expect(signals[0].aborted).toBe(false);
      release();
      expect((await running).ok).toBe(true);
    });

    it("stops with the job's signal while the AI is asked", async () => {
      const controller = new AbortController();
      suggestDishes.mockImplementationOnce(async (_input: SuggestDishesInput, aiSignal: AbortSignal) => {
        controller.abort();
        expect(aiSignal.aborted).toBe(true);
        return fail("ai_unavailable");
      });
      expect(await suggestFromPantry({ avoidTitles: [] }, { signal: controller.signal })).toEqual(fail("ai_unavailable"));
    });
  });
});

describe("checkSuggestPantry", () => {
  it("gives the place the job is about when there is something at home", async () => {
    expect(await checkSuggestPantry()).toEqual(ok({ siteId: stugan.id }));
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives suggest_empty_pantry at once for an empty pantry, so no job is queued", async () => {
    getPantrySnapshot.mockResolvedValue(new Map());
    expect(await checkSuggestPantry()).toEqual(fail("suggest_empty_pantry"));
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("gives pantry_unavailable when the pantry cannot be read", async () => {
    getPantrySnapshot.mockRejectedValue(new PantryDataError("query_failed 500"));
    expect(await checkSuggestPantry()).toEqual(fail("pantry_unavailable"));
  });
});

describe("the pantry sent", () => {
  it("passes the AI port's check when it is as full as the limits allow", () => {
    const snapshot: PantrySnapshot = new Map(Array.from({ length: 60 }, (_, index) => [`id-${index}`, { unlimited: true, amounts: [] }]));
    const names = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`id-${index}`, `${index}`.padEnd(100, "x")]));
    const { input, dropped } = toSuggestInput(snapshot, names, []);
    expect(dropped).toBeGreaterThan(0);
    expect(isValidSuggestDishesInput(input)).toBe(true);
  });
});

describe("suggestFromPantry in the mode offers (Story 9.5)", () => {
  const offer = (name: string, label: string, ingredientId: string | null) => ({ name, label, ingredientId });
  const offers = [
    offer("falukorv", "Falukorv 29 kr", id(7)),
    offer("broccoli", "Broccoli 15 kr", null),
    offer("kycklingfilé", "Kyckling 99 kr", id(8)),
  ];
  const offersKnown: Record<string, string> = { ...known, falukorv: id(7), kycklingfilé: id(8), makaroner: ids.salt };

  beforeEach(() => {
    getActiveOffers.mockResolvedValue(offers);
    matchIngredients.mockImplementation(async (items) =>
      items.map((item): IngredientMatch => {
        const matched = item.hint ? offersKnown[item.hint.name] : undefined;
        return matched
          ? { kind: "match", ingredientId: matched, confidence: "hint" }
          : { kind: "new", proposal: { name: item.hint?.name ?? item.text, section: "Övrigt", location: "Skafferi", defaultUnit: null } };
      }),
    );
  });

  it("gives the model the offers' names, never prices or ids, and labels what each dish uses with how much is at home", async () => {
    const result = await suggestFromPantry({ avoidTitles: [], mode: "offers" }, { signal: signal() });

    const [input] = suggestDishes.mock.calls[0];
    // Offers with a catalog ingredient first.
    expect(input.offers).toEqual(["falukorv", "kycklingfilé", "broccoli"]);
    expect(JSON.stringify(input)).not.toMatch(/kr|6f1c1b7e/);

    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.mode).toBe("offers");
    const [falukorv, broccoli, kyckling] = result.data.suggestions;
    expect(falukorv.draft.title).toBe("Falukorv med stuvade makaroner");
    expect(falukorv.onOffer).toEqual(["Falukorv 29 kr"]);
    // Only makaroner is linked to something at home here (the pantry's salt id); falukorv is on offer, not at home.
    expect(falukorv.atHome).toEqual({ have: 1, total: 6 });
    expect(broccoli.onOffer).toEqual(["Broccoli 15 kr"]);
    expect(kyckling.onOffer).toEqual(["Kyckling 99 kr"]);
  });

  it("reads the offers of the given store (Story 9.13), else the selected one, and refuses a store that is not the user's", async () => {
    await suggestFromPantry({ avoidTitles: [], mode: "offers" }, { signal: signal() });
    expect(getActiveOffers).toHaveBeenLastCalledWith("store");
    await suggestFromPantry({ avoidTitles: [], mode: "offers", storeId: "krokom" }, { signal: signal() });
    expect(getActiveOffers).toHaveBeenLastCalledWith("krokom");
    getActiveOffers.mockClear();
    expect(await checkSuggestPantry("offers", "someone-elses")).toEqual(fail("offers_store_missing"));
    expect(getActiveOffers).not.toHaveBeenCalled();
  });

  it("does not hold a dish to the pantry rule, and works around an empty pantry", async () => {
    getPantrySnapshot.mockResolvedValue(new Map());
    const result = await suggestFromPantry({ avoidTitles: [], mode: "offers" }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.suggestions).toHaveLength(3);
    expect(suggestDishes.mock.calls[0][0].pantry).toEqual([]);
  });

  it.each([
    ["without a store", () => getSelectedStore.mockResolvedValue(null), "offers_store_missing"],
    ["without offers", () => getActiveOffers.mockResolvedValue([]), "offers_none"],
    ["when the offers cannot be read", () => getActiveOffers.mockRejectedValue(new OffersDataError("read_failed")), "offers_unavailable"],
  ])("fails %s, before the model is asked", async (_name, arrange, code) => {
    arrange();
    expect(await checkSuggestPantry("offers")).toEqual(fail(code as "offers_none"));
    expect(await suggestFromPantry({ avoidTitles: [], mode: "offers" }, { signal: signal() })).toEqual(fail(code as "offers_none"));
    expect(suggestDishes).not.toHaveBeenCalled();
  });

  it("checks an empty pantry as fine when there are offers, and leaves pantry suggestions without offers", async () => {
    getPantrySnapshot.mockResolvedValue(new Map());
    expect((await checkSuggestPantry("offers")).ok).toBe(true);
    expect(await checkSuggestPantry()).toEqual(fail("suggest_empty_pantry"));
    getPantrySnapshot.mockResolvedValue(pantry);
    getActiveOffers.mockClear();
    const plain = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
    if (!plain.ok) throw new Error(plain.error.code);
    expect(plain.data.mode).toBe("pantry");
    expect(plain.data.suggestions.every(({ onOffer, atHome }) => onOffer.length === 0 && atHome === null)).toBe(true);
    expect(getActiveOffers).not.toHaveBeenCalled();
  });
});
