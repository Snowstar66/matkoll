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

const ai = withInputValidation(createMockAiService());
const suggestDishes = vi.fn(ai.suggestDishes);
vi.mock("@/server/ai", () => ({ getAiService: () => ({ suggestDishes }) }));

const { isSuggesting, suggestFromPantry, postModelMarginMs } = await import("./suggest-from-pantry");

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

  describe("one run per user", () => {
    /** Holds the AI call until `release`, so a second request comes while it runs. */
    function holdAi() {
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
      return { release, signals };
    }

    it("stops the earlier run when the same user asks again", async () => {
      const first = holdAi();
      const running = suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));

      const second = await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      expect(second.ok).toBe(true);
      expect(first.signals[0].aborted).toBe(true);
      first.release();
      expect(await running).toEqual(fail("ai_unavailable"));
    });

    it("says a run is on its way only while it is, and only for its user (Story 12.2)", async () => {
      const first = holdAi();
      expect(isSuggesting("user")).toBe(false);
      const running = suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));
      expect(isSuggesting("user")).toBe(true);
      expect(isSuggesting("someone-else")).toBe(false);
      first.release();
      await running;
      expect(isSuggesting("user")).toBe(false);
    });

    it("holds a warm-up off for a while once the run has finished (Story 12.2)", async () => {
      const { claimWarmUp, resetWarmUps } = await import("@/server/ai/warm-limit");
      resetWarmUps();
      await suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      expect(claimWarmUp("user", "lmstudio:model")).toBe(false);
      expect(claimWarmUp("someone-else", "lmstudio:model")).toBe(true);
      resetWarmUps();
    });

    it("leaves another user's run alone", async () => {
      const first = holdAi();
      const running = suggestFromPantry({ avoidTitles: [] }, { signal: signal() });
      await vi.waitFor(() => expect(first.signals).toHaveLength(1));

      requireUser.mockResolvedValueOnce(user("someone-else"));
      expect((await suggestFromPantry({ avoidTitles: [] }, { signal: signal() })).ok).toBe(true);
      expect(first.signals[0].aborted).toBe(false);
      first.release();
      expect((await running).ok).toBe(true);
    });
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
