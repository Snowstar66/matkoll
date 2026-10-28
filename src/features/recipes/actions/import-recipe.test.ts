import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngredientMatch, MatchItem } from "@/features/catalog";
import { errorMessages, fail, ok } from "@/lib/errors";
import { createMockAiService } from "@/server/ai/adapters/mock";

// importRecipe with the AI port's mock (tests/fixtures/ai), the fetch port on
// the saved pages in tests/fixtures/sites (AI_PROVIDER=mock), and a stubbed
// catalog and settings module.

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

const { SettingsDataError } = vi.hoisted(() => ({
  SettingsDataError: class SettingsDataError extends Error {
    constructor(readonly detail: string) {
      super(`settings_data: ${detail}`);
    }
  },
}));
const getActiveRecipeDomains = vi.fn<() => Promise<string[]>>();
vi.mock("@/features/settings/server", () => ({
  SettingsDataError,
  getActiveRecipeDomains: () => getActiveRecipeDomains(),
}));

// The fetch port reads the saved pages, as with AI_PROVIDER=mock in E2E and CI.
vi.mock("@/server/env", () => ({ env: { AI_PROVIDER: "mock", SITE_URL: "http://localhost:3100" } }));

const ai = createMockAiService();
const parseRecipe = vi.fn(ai.parseRecipe);
vi.mock("@/server/ai", () => ({ getAiService: () => ({ parseRecipe }) }));

const { importRecipe, prepareImport } = await import("./import-recipe");

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
  getActiveRecipeDomains.mockReset().mockResolvedValue(["koket.se", "tasteline.com"]);
});

describe("importRecipe", () => {
  it("parses the text, matches the lines and returns a draft with the matched names", async () => {
    const controller = new AbortController();
    const result = await importRecipe({ kind: "text", text: linssoppa }, { signal: controller.signal });

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
    const result = await importRecipe({ kind: "text", text: linssoppa }, { signal: signal() });
    expect(result.ok && result.data.ingredientNames).toEqual({});
    expect(getIngredientNames).not.toHaveBeenCalled();
  });

  it("returns unauthorized without a user, before calling the model", async () => {
    requireUser.mockResolvedValue(fail("unauthorized"));
    expect(await importRecipe({ kind: "text", text: linssoppa }, { signal: signal() })).toEqual(fail("unauthorized"));
    expect(parseRecipe).not.toHaveBeenCalled();
  });

  it.each(["ai_unavailable", "ai_invalid", "ai_rejected", "import_no_recipe"] as const)(
    "passes on %s from the AI port without matching",
    async (code) => {
      const result = await importRecipe({ kind: "text", text: `matkoll-mock: ${code}` }, { signal: signal() });
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
    expect(await importRecipe({ kind: "text", text: linssoppa }, { signal: signal() })).toEqual(fail("catalog_unavailable"));
    expect(log).toHaveBeenCalledWith("catalog_unavailable", { reason: "query_failed" });
    log.mockRestore();
  });

  it("throws errors that are bugs instead of reporting the catalog", async () => {
    matchIngredients.mockResolvedValue([]);
    await expect(importRecipe({ kind: "text", text: linssoppa }, { signal: signal() })).rejects.toThrow("one match per ingredient");
  });

  it("gives ai_invalid for a draft that does not pass recipeDraftSchema", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const answer = await ai.parseRecipe({ text: linssoppa }, signal());
    if (!answer.ok) throw new Error(answer.error.code);
    parseRecipe.mockResolvedValueOnce(ok({ ...answer.data, title: "   " }));
    expect(await importRecipe({ kind: "text", text: linssoppa }, { signal: signal() })).toEqual(fail("ai_invalid"));
    expect(log).toHaveBeenCalledWith("ai_invalid", { reason: "draft" });
    log.mockRestore();
  });
});

describe("importRecipe from a link", () => {
  const chowMein = "https://www.koket.se/chow-mein-med-lovbiff";
  const fetaost = "https://www.tasteline.com/recept/bakad-fetaost-med-rostad-potatis/";

  it("fetches the page, sends its text and JSON-LD to parseRecipe and keeps the source", async () => {
    const controller = new AbortController();
    const result = await importRecipe({ kind: "url", url: chowMein }, { signal: controller.signal });

    const [input, signal] = parseRecipe.mock.calls[0];
    expect(signal).toBe(controller.signal);
    expect(input.text).toBe(fixture("koket-chow-mein.txt"));
    expect(input.jsonLd).toBe(fixture("koket-chow-mein.jsonld.json"));
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.draft).toMatchObject({
      title: "Chow mein med lövbiff",
      servings: 4,
      totalMinutes: 45,
      sourceKind: "url",
      sourceUrl: chowMein,
      imageUrl: "https://img.koket.se/standard-mega/chow-mein-med-lovbiff-filip-poons-recept.png.jpg",
    });
    expect(result.data.draft.lines).toHaveLength(19);
  });

  it("reads tasteline.com too", async () => {
    const result = await importRecipe({ kind: "url", url: fetaost }, { signal: signal() });
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.draft).toMatchObject({ title: "Bakad fetaost med rostad potatis", sourceUrl: fetaost });
  });

  it("keeps the address after redirects as the source", async () => {
    const result = await importRecipe({ kind: "url", url: "https://koket.se/chow-mein-med-lovbiff" }, { signal: signal() });
    expect(result.ok && result.data.draft.sourceUrl).toBe(chowMein);
  });

  it("refuses a site that is not approved, without fetching or calling the model", async () => {
    const result = await importRecipe({ kind: "url", url: "https://www.example.com/recept" }, { signal: signal() });
    expect(result).toEqual(fail("fetch_domain_not_allowed", { domain: "example.com" }));
    expect(parseRecipe).not.toHaveBeenCalled();
  });

  it("uses the user's own list: a site that is turned off is not approved", async () => {
    getActiveRecipeDomains.mockResolvedValue(["tasteline.com"]);
    expect(await importRecipe({ kind: "url", url: chowMein }, { signal: signal() })).toEqual(
      fail("fetch_domain_not_allowed", { domain: "koket.se" }),
    );
  });

  it.each([
    ["http", "http://www.koket.se/chow-mein-med-lovbiff"],
    ["an IP address", "https://127.0.0.1/recept"],
    ["text that is not a link", "chow mein"],
  ])("gives fetch_invalid_url for %s", async (_name, url) => {
    expect(await importRecipe({ kind: "url", url }, { signal: signal() })).toEqual(fail("fetch_invalid_url"));
    expect(parseRecipe).not.toHaveBeenCalled();
  });

  it("gives fetch_blocked for a site that refuses, and import_no_recipe for a page without a recipe", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await importRecipe({ kind: "url", url: "https://www.koket.se/matkoll-test/blockerad" }, { signal: signal() })).toEqual(
      fail("fetch_blocked", { domain: "koket.se" }),
    );
    expect(
      await importRecipe({ kind: "url", url: "https://www.koket.se/matkoll-test/inget-recept" }, { signal: signal() }),
    ).toEqual(fail("import_no_recipe"));
    log.mockRestore();
  });

  it("gives import_no_recipe for a page with neither JSON-LD nor text, without calling the model", async () => {
    expect(await importRecipe({ kind: "url", url: "https://www.koket.se/matkoll-test/tom-sida" }, { signal: signal() })).toEqual(
      fail("import_no_recipe"),
    );
    expect(parseRecipe).not.toHaveBeenCalled();
  });

  it("refuses a link that is not https before reading the sites", async () => {
    getActiveRecipeDomains.mockRejectedValue(new SettingsDataError("query_failed 500"));
    expect(await importRecipe({ kind: "url", url: "http://www.koket.se/x" }, { signal: signal() })).toEqual(
      fail("fetch_invalid_url"),
    );
    expect(getActiveRecipeDomains).not.toHaveBeenCalled();
  });

  it("gives settings_unavailable when the sites cannot be read, and logs only the reason", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    getActiveRecipeDomains.mockRejectedValue(new SettingsDataError("query_failed 500"));
    expect(await importRecipe({ kind: "url", url: chowMein }, { signal: signal() })).toEqual(fail("settings_unavailable"));
    expect(log).toHaveBeenCalledWith("settings_unavailable", { reason: "query_failed 500" });
    log.mockRestore();
  });

  it("does not read the sites for pasted text", async () => {
    await importRecipe({ kind: "text", text: linssoppa }, { signal: signal() });
    expect(getActiveRecipeDomains).not.toHaveBeenCalled();
  });
});

describe("importRecipe from a photo", () => {
  const png = () =>
    new Uint8Array(readFileSync(new URL("../../../../tests/fixtures/ai/ugnspannkaka.png", import.meta.url)));

  it("sends the image to parseRecipe as it is, with the signal, and marks the draft as a photo", async () => {
    const controller = new AbortController();
    const image = { data: png(), mediaType: "image/png" as const };
    const result = await importRecipe({ kind: "photo", image }, { signal: controller.signal });

    expect(parseRecipe).toHaveBeenCalledWith({ image }, controller.signal);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.data.draft).toMatchObject({
      title: "Ugnspannkaka med bacon",
      sourceKind: "photo",
      sourceUrl: null,
      imageUrl: null,
    });
    expect(getActiveRecipeDomains).not.toHaveBeenCalled();
  });

  it("passes on import_no_recipe from the AI port", async () => {
    parseRecipe.mockResolvedValueOnce(fail("import_no_recipe"));
    const result = await importRecipe({ kind: "photo", image: { data: png(), mediaType: "image/png" } }, { signal: signal() });
    expect(result).toEqual(fail("import_no_recipe"));
    expect(matchIngredients).not.toHaveBeenCalled();
  });

  it("gives validation for an image the AI port does not take", async () => {
    // The port checks the limits itself too (withInputValidation); the route checks them first.
    const { createAiService } = await import("@/server/ai/service");
    const checked = createAiService({ AI_PROVIDER: "mock" } as Parameters<typeof createAiService>[0]);
    parseRecipe.mockImplementationOnce(checked.parseRecipe);
    const result = await importRecipe(
      { kind: "photo", image: { data: new Uint8Array(0), mediaType: "image/jpeg" } },
      { signal: signal() },
    );
    expect(result).toEqual(fail("validation"));
  });
});

describe("prepareImport", () => {
  it("gives the source for text and photo, without reading anything", async () => {
    expect(await prepareImport({ kind: "text", text: "Linssoppa" })).toEqual(ok({ source: "text" }));
    expect(await prepareImport({ kind: "photo", image: { data: new Uint8Array(1), mediaType: "image/png" } })).toEqual(
      ok({ source: "photo" }),
    );
    expect(getActiveRecipeDomains).not.toHaveBeenCalled();
  });

  it("gives validation for an empty text and one over 12 000 characters", async () => {
    expect(await prepareImport({ kind: "text", text: "   " })).toEqual(fail("validation"));
    expect(await prepareImport({ kind: "text", text: "a".repeat(13_000) })).toEqual(fail("validation"));
  });

  it("gives only the domain of an approved link, without www", async () => {
    expect(await prepareImport({ kind: "url", url: "https://www.koket.se/recept/linssoppa?x=1" })).toEqual(
      ok({ source: "url", domain: "koket.se" }),
    );
  });

  it("refuses a bad link before reading the sites, and a site that is not approved with its name", async () => {
    expect(await prepareImport({ kind: "url", url: "koket" })).toEqual(fail("fetch_invalid_url"));
    expect(getActiveRecipeDomains).not.toHaveBeenCalled();
    expect(await prepareImport({ kind: "url", url: "https://www.ica.se/recept" })).toEqual(
      fail("fetch_domain_not_allowed", { domain: "ica.se" }),
    );
  });

  it("gives settings_unavailable when the sites cannot be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getActiveRecipeDomains.mockRejectedValue(new SettingsDataError("read_failed"));
    expect(await prepareImport({ kind: "url", url: "https://www.koket.se/x" })).toEqual(fail("settings_unavailable"));
  });
});
