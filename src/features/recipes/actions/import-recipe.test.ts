import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, MatchItem } from "@/features/catalog";
import { errorMessages, fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";

// importRecipe with the AI port's mock (tests/fixtures/ai) and a stubbed catalog.

const requireUser = vi.fn();
vi.mock("@/features/auth/server", () => ({ requireUser: () => requireUser() }));

const matchIngredients = vi.fn<(items: readonly MatchItem[]) => Promise<IngredientMatch[]>>();
const getIngredientNames = vi.fn<(ids: readonly string[]) => Promise<Record<string, string>>>();
const { CatalogDataError } = vi.hoisted(() => ({
  CatalogDataError: class CatalogDataError extends Error {
    constructor(readonly code: string) {
      super(`catalog_${code}`);
    }
  },
}));
vi.mock("@/features/catalog/server", () => ({
  CatalogDataError,
  matchIngredients: (items: readonly MatchItem[]) => matchIngredients(items),
  getIngredientNames: (ids: readonly string[]) => getIngredientNames(ids),
}));

const ai = createMockAiService();
const parseRecipe = vi.fn(ai.parseRecipe);
vi.mock("@/server/ai", () => ({ getAiService: () => ({ parseRecipe }) }));

const { importRecipe } = await import("./import-recipe");

const gulLok = "6f1c1b7e-3c1a-4c55-9a59-0f3f2b8f2a01";
const fixture = (name: string) => readFileSync(new URL(`../../../../tests/fixtures/ai/${name}`, import.meta.url), "utf8");
const linssoppa = fixture("linssoppa.txt");
const signal = () => new AbortController().signal;

beforeEach(() => {
  requireUser.mockReset().mockResolvedValue(ok({ id: "user", email: "pontus@example.com" }));
  parseRecipe.mockClear();
  // The first line matches by the AI's name; the rest are new.
  matchIngredients.mockReset().mockImplementation(async (items) =>
    items.map((item, index): IngredientMatch =>
      index === 0
        ? { kind: "match", ingredientId: gulLok, confidence: "hint" }
        : {
            kind: "new",
            proposal: { name: item.hint?.name ?? item.text, section: "Övrigt", location: "Skafferi", defaultUnit: null },
          },
    ),
  );
  getIngredientNames.mockReset().mockResolvedValue({ [gulLok]: "Gul lök" });
});

describe("importRecipe", () => {
  it("parses the text, matches the lines and returns a draft with the matched names", async () => {
    const controller = new AbortController();
    const result = await importRecipe({ text: linssoppa }, { signal: controller.signal });

    expect(parseRecipe).toHaveBeenCalledWith({ text: linssoppa }, controller.signal);
    expect(matchIngredients.mock.calls[0][0][0]).toEqual({
      text: "2 gula lökar",
      hint: { name: "gul lök", section: "Frukt och grönt", location: "Skafferi", defaultUnit: "st" },
    });
    expect(getIngredientNames).toHaveBeenCalledWith([gulLok]);
    if (!result.ok) throw new Error(result.error.code);
    const { draft, ingredientNames } = result.data;
    expect(ingredientNames).toEqual({ [gulLok]: "Gul lök" });
    expect(draft).toMatchObject({ title: "Röd linssoppa med kokosmjölk", servings: 6, totalMinutes: 30, sourceKind: "text" });
    expect(draft.lines[0]).toMatchObject({
      originalText: "2 gula lökar",
      amount: 2,
      unit: null,
      ingredient: { kind: "match", ingredientId: gulLok, confidence: "hint" },
    });
    // "1 bit färsk ingefära": "bit" is not a catalog unit, so the line is vague.
    expect(draft.lines.find((line) => line.originalText.startsWith("1 bit"))).toMatchObject({
      amount: null,
      unit: null,
      isVague: true,
    });
  });

  it("does not look up names when nothing matched", async () => {
    matchIngredients.mockImplementation(async (items) => items.map((): IngredientMatch => ({ kind: "unmatched" })));
    const result = await importRecipe({ text: linssoppa }, { signal: signal() });
    expect(result.ok && result.data.ingredientNames).toEqual({});
    expect(getIngredientNames).not.toHaveBeenCalled();
  });

  it("returns unauthorized without a user, before calling the model", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await importRecipe({ text: linssoppa }, { signal: signal() })).toEqual(fail("unauthorized"));
    expect(parseRecipe).not.toHaveBeenCalled();
  });

  it.each(["ai_unavailable", "ai_invalid", "ai_rejected", "import_no_recipe"] as const)(
    "passes on %s from the AI port without matching",
    async (code) => {
      const result = await importRecipe({ text: `matkoll-mock: ${code}` }, { signal: signal() });
      expect(result).toEqual({ ok: false, error: { code, message: errorMessages[code] } });
      expect(matchIngredients).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["matching", () => matchIngredients.mockRejectedValue(new CatalogDataError("query_failed"))],
    ["reading names", () => getIngredientNames.mockRejectedValue(new CatalogDataError("query_failed"))],
  ])("gives catalog_unavailable when %s fails, and logs only the code", async (_name, arrange) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    arrange();
    expect(await importRecipe({ text: linssoppa }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
    expect(log).toHaveBeenCalledWith("catalog_unavailable", { reason: "query_failed" });
    log.mockRestore();
  });

  it("throws errors that are bugs instead of reporting the catalog", async () => {
    matchIngredients.mockResolvedValue([]);
    await expect(importRecipe({ text: linssoppa }, { signal: signal() })).rejects.toThrow("one match per ingredient");
  });

  it("gives ai_invalid for a draft that does not pass recipeDraftSchema", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await ai.parseRecipe({ text: linssoppa }, signal());
    if (!answer.ok) throw new Error(answer.error.code);
    parseRecipe.mockResolvedValueOnce(ok({ ...answer.data, title: "   " }));
    expect(await importRecipe({ text: linssoppa }, { signal: signal() })).toEqual(fail("ai_invalid"));
    expect(log).toHaveBeenCalledWith("ai_invalid", { reason: "draft" });
    log.mockRestore();
  });
});
