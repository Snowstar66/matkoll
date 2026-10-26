import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compare, type Expected } from "../../../../tests/eval/compare";
import { checkSuggestions, type SuggestExpected } from "../../../../tests/eval/suggest-checks";
import { imageSizeOf, imageTypeOf, maxImageBytes, maxImageSide } from "@/lib/images";
import { aiPantryItem, aiRecipe, analyzeImageAnswer, suggestDishesAnswer } from "../schemas";
import type { SuggestDishesInput } from "../service";
import {
  createMockAiService,
  defaultFixturesDir,
  mockAnalyzeErrorCodes,
  mockErrorCodes,
  mockKey,
  mockSuggestErrorCodes,
  normalizeInputText,
} from "./mock";

const dir = defaultFixturesDir;
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const response = (name: string) => aiRecipe.parse(JSON.parse(read(`${name}.response.json`)));
type Manifest = {
  default: string;
  cases: { name: string; jsonLd?: boolean; image?: boolean }[];
  reserved: { text: string; code: string }[];
  reservedImages: { image: string; code: string }[];
  suggest: string;
  suggestAlternatives: string[];
  analyze: { default: string; cases: { name: string }[] };
};
const manifest = JSON.parse(read("manifest.json")) as Manifest;
const signal = () => new AbortController().signal;
const inputFor = ({ name, jsonLd }: Manifest["cases"][number]) => ({
  text: read(`${name}.txt`),
  jsonLd: jsonLd ? read(`${name}.jsonld.json`) : undefined,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mock AI service", () => {
  const service = createMockAiService();

  it.each(manifest.cases.map((testCase) => [testCase.name, testCase] as const))(
    "answers the %s input with its fixture",
    async (name, testCase) => {
      const result = await service.parseRecipe(inputFor(testCase), signal());
      expect(result).toEqual({ ok: true, data: response(name) });
    },
  );

  it("keys a JSON-LD case on text and JSON-LD together", async () => {
    const result = await service.parseRecipe({ text: read("kladdkaka.txt") }, signal());
    expect(result).toEqual({ ok: true, data: response(manifest.default) });
  });

  it("gives the same answer every time and for the same text with other whitespace and case", async () => {
    const text = read("linssoppa.txt");
    const first = await service.parseRecipe({ text }, signal());
    const second = await service.parseRecipe({ text: `\n  ${text.toUpperCase().replace(/\n/g, "\r\n")}  ` }, signal());
    expect(second).toEqual(first);
    expect(first).toEqual({ ok: true, data: response("linssoppa") });
  });

  it("answers unknown text with the default fixture", async () => {
    const result = await service.parseRecipe({ text: "Ett recept som inte finns bland fixturerna." }, signal());
    expect(result).toEqual({ ok: true, data: response(manifest.default) });
  });

  it("answers an image case by the image bytes", async () => {
    const imageCase = manifest.cases.find((testCase) => testCase.image);
    expect(imageCase).toBeDefined();
    const data = new Uint8Array(readFileSync(join(dir, `${imageCase!.name}.png`)));
    const result = await service.parseRecipe({ image: { data, mediaType: "image/png" } }, signal());
    expect(result).toEqual({ ok: true, data: response(imageCase!.name) });
  });

  it("covers every error code it can be asked for with a reserved input", () => {
    expect(manifest.reserved.map((entry) => entry.code).sort()).toEqual([...mockErrorCodes].sort());
  });

  it.each(manifest.reserved.map((entry) => [entry.code, entry.text]))(
    "fails with %s for its reserved input",
    async (code, text) => {
      const result = await service.parseRecipe({ text: `  ${text.toUpperCase()} ` }, signal());
      expect(result).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("covers every error code with a reserved image too", () => {
    expect(manifest.reservedImages.map((entry) => entry.code).sort()).toEqual([...mockErrorCodes].sort());
  });

  it.each(manifest.reservedImages.map((entry) => [entry.code, entry.image]))(
    "fails with %s for its reserved image",
    async (code, image) => {
      const data = new Uint8Array(readFileSync(join(dir, image)));
      const result = await service.parseRecipe({ image: { data, mediaType: "image/png" } }, signal());
      expect(result).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("returns a copy, so a caller cannot change the fixture", async () => {
    const first = await service.parseRecipe({ text: read("kycklinggryta.txt") }, signal());
    if (!first.ok) throw new Error("expected ok");
    first.data.title = "Ändrad";
    const second = await service.parseRecipe({ text: read("kycklinggryta.txt") }, signal());
    expect(second.ok && second.data.title).toBe("Krämig kycklinggryta med curry");
  });

  it("gives ai_unavailable when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await service.parseRecipe({ text: read("kycklinggryta.txt") }, controller.signal);
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
  });

  it("gives ai_unavailable, once loaded, when the fixtures are missing", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const empty = mkdtempSync(join(tmpdir(), "matkoll-mock-"));
    try {
      const broken = createMockAiService(empty);
      for (let call = 0; call < 2; call++) {
        const result = await broken.parseRecipe({ text: "x" }, signal());
        expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
      }
      expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason: "fixtures" });
      expect(JSON.stringify(errors.mock.calls)).not.toContain(empty);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("mock suggestDishes", () => {
  const service = createMockAiService();
  const pantryInput = JSON.parse(read(`${manifest.suggest}.pantry.json`)) as SuggestDishesInput;
  const setOf = (name: string) => suggestDishesAnswer.parse(JSON.parse(read(`${name}.response.json`))).suggestions;
  const suggestions = () => setOf(manifest.suggest);
  const alternative = () => setOf(manifest.suggestAlternatives[0]);

  it("answers the three fixture recipes, whatever is at home", async () => {
    expect(await service.suggestDishes(pantryInput, signal())).toEqual({ ok: true, data: suggestions() });
    const other = { pantry: [{ name: "havregryn", amount: 1, unit: "kg" }], avoidTitles: ["Gröt"] };
    expect(await service.suggestDishes(other, signal())).toEqual({ ok: true, data: suggestions() });
  });

  it.each(mockSuggestErrorCodes.map((code) => [code]))(
    "fails with %s for a pantry item with its reserved name",
    async (code) => {
      const text = manifest.reserved.find((entry) => entry.code === code)!.text;
      const input = { pantry: [...pantryInput.pantry, { name: `  ${text.toUpperCase()} `, amount: null, unit: null }], avoidTitles: [] };
      expect(await service.suggestDishes(input, signal())).toMatchObject({ ok: false, error: { code } });
    },
  );

  it("treats the reserved text for import_no_recipe as an ordinary pantry item", async () => {
    const text = manifest.reserved.find((entry) => entry.code === "import_no_recipe")!.text;
    const result = await service.suggestDishes({ pantry: [{ name: text, amount: null, unit: null }], avoidTitles: [] }, signal());
    expect(result.ok).toBe(true);
  });

  it("returns a copy, so a caller cannot change the fixture", async () => {
    const first = await service.suggestDishes(pantryInput, signal());
    if (!first.ok) throw new Error("expected ok");
    first.data[0].title = "Ändrad";
    const second = await service.suggestDishes(pantryInput, signal());
    expect(second.ok && second.data[0].title).toBe("Kycklinggryta med tomat och grädde");
  });

  it("gives ai_unavailable when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await service.suggestDishes(pantryInput, controller.signal);
    expect(result).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
  });

  it("answers the other set when every title of the first is to be avoided, and ai_invalid when all are", async () => {
    const titles = (set: { title: string }[]) => set.map((recipe) => recipe.title);
    const some = { ...pantryInput, avoidTitles: [titles(suggestions())[0]] };
    expect(await service.suggestDishes(some, signal())).toEqual({ ok: true, data: alternative() });
    const first = { ...pantryInput, avoidTitles: titles(suggestions()).map((title) => `  ${title.toUpperCase()} `) };
    expect(await service.suggestDishes(first, signal())).toEqual({ ok: true, data: alternative() });
    const second = { ...pantryInput, avoidTitles: titles(alternative()) };
    expect(await service.suggestDishes(second, signal())).toEqual({ ok: true, data: suggestions() });
    const both = { ...pantryInput, avoidTitles: [titles(suggestions())[0], titles(alternative())[0]] };
    expect(await service.suggestDishes(both, signal())).toMatchObject({ ok: false, error: { code: "ai_invalid" } });
  });

  it("meets its own expectations for the eval's pantry, in both sets", () => {
    const expected = JSON.parse(read(`${manifest.suggest}.expected.json`)) as SuggestExpected;
    for (const set of [suggestions(), alternative()]) {
      expect(checkSuggestions(set, pantryInput, expected).filter((check) => !check.ok)).toEqual([]);
    }
  });

  it("keeps imports working when the suggest fixture is broken", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = mkdtempSync(join(tmpdir(), "matkoll-mock-"));
    try {
      cpSync(dir, copy, { recursive: true });
      writeFileSync(join(copy, `${manifest.suggest}.response.json`), "{ broken");
      const broken = createMockAiService(copy);
      expect(await broken.suggestDishes(pantryInput, signal())).toMatchObject({ ok: false, error: { code: "ai_unavailable" } });
      expect(await broken.parseRecipe({ text: read("linssoppa.txt") }, signal())).toEqual({ ok: true, data: response("linssoppa") });
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe("mock analyzeImage", () => {
  const service = createMockAiService();
  const photo = (file: string) => ({ data: new Uint8Array(readFileSync(join(dir, file))), mediaType: "image/png" });
  const answer = (name: string) =>
    analyzeImageAnswer.parse(JSON.parse(read(`${name}.analyze.json`))).items.map((item) => aiPantryItem.parse(item));
  const answered = (name: string) => ({ ok: true, data: { items: answer(name), invalid: 0 } });

  it.each(manifest.analyze.cases.map(({ name }) => [name]))("answers the photo %s.png with its fixture", async (name) => {
    expect(await service.analyzeImage({ image: photo(`${name}.png`), place: "Kyl" }, signal())).toEqual(answered(name));
  });

  it("answers any other photo with the default case, whatever the place", async () => {
    const other = { data: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" };
    expect(await service.analyzeImage({ image: other, place: "Frys" }, signal())).toEqual(answered(manifest.analyze.default));
  });

  it("has the six items of Flöde 3 in kyl, and none in tom-hylla", () => {
    expect(answer("kyl").map(({ hint, amount, unit }) => [hint.name, amount, unit])).toEqual([
      ["mjölk", 1, "förp"],
      ["grädde", 1, "förp"],
      ["smör", 1, "förp"],
      ["ägg", 6, "st"],
      ["gurka", 2, null],
      ["ketchup", 1, "tub"],
    ]);
    expect(answer("kyl")[0].label).toMatch(/mellanmjölk/i);
    expect(answer("kyl")[1].label).toMatch(/vispgrädde/i);
    expect(answer("tom-hylla")).toEqual([]);
  });

  it.each(manifest.analyze.cases.map(({ name }) => [name]))(
    "%s.png is a PNG the client sends as it is: under 1600 px and 1.5 MB",
    (name) => {
      const bytes = new Uint8Array(readFileSync(join(dir, `${name}.png`)));
      expect(imageTypeOf(bytes)).toBe("image/png");
      const size = imageSizeOf(bytes)!;
      expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(maxImageSide);
      expect(bytes.byteLength).toBeLessThanOrEqual(maxImageBytes);
    },
  );

  it.each(mockAnalyzeErrorCodes.map((code) => [code]))("fails with %s for its reserved image", async (code) => {
    const image = manifest.reservedImages.find((entry) => entry.code === code)!.image;
    expect(await service.analyzeImage({ image: photo(image), place: "Kyl" }, signal())).toMatchObject({
      ok: false,
      error: { code },
    });
  });

  it("answers the reserved image for import_no_recipe with the default case: a photo of a place has no recipe", async () => {
    const image = manifest.reservedImages.find((entry) => entry.code === "import_no_recipe")!.image;
    expect(await service.analyzeImage({ image: photo(image), place: "Kyl" }, signal())).toEqual(answered(manifest.analyze.default));
  });

  it("returns a copy, so a caller cannot change the fixture", async () => {
    const first = await service.analyzeImage({ image: photo("kyl.png"), place: "Kyl" }, signal());
    if (!first.ok) throw new Error("expected ok");
    first.data.items[0].label = "Ändrad";
    const second = await service.analyzeImage({ image: photo("kyl.png"), place: "Kyl" }, signal());
    expect(second.ok && second.data.items[0].label).toBe(answer("kyl")[0].label);
  });

  it("gives ai_unavailable when the signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await service.analyzeImage({ image: photo("kyl.png"), place: "Kyl" }, controller.signal)).toMatchObject({
      ok: false,
      error: { code: "ai_unavailable" },
    });
  });

  it("keeps imports and suggestions working when an analyze fixture is broken, and loads it only when asked", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const copy = mkdtempSync(join(tmpdir(), "matkoll-mock-"));
    try {
      cpSync(dir, copy, { recursive: true });
      // Of the right shape, but an item that does not pass on its own: a fixture must be a valid answer.
      const fixture = JSON.parse(read("kyl.analyze.json")) as { items: { amount: number | null }[] };
      fixture.items[0].amount = -1;
      writeFileSync(join(copy, "kyl.analyze.json"), JSON.stringify(fixture));
      const broken = createMockAiService(copy);
      expect(await broken.parseRecipe({ text: read("linssoppa.txt") }, signal())).toEqual({ ok: true, data: response("linssoppa") });
      expect((await broken.suggestDishes(JSON.parse(read(`${manifest.suggest}.pantry.json`)), signal())).ok).toBe(true);
      expect(errors).not.toHaveBeenCalled();
      expect(await broken.analyzeImage({ image: photo("kyl.png"), place: "Kyl" }, signal())).toMatchObject({
        ok: false,
        error: { code: "ai_unavailable" },
      });
      expect(errors).toHaveBeenCalledWith("ai_unavailable", { reason: "fixtures" });
    } finally {
      rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe("mock key", () => {
  it("is the SHA-256 of the normalized text", () => {
    expect(normalizeInputText({ text: "  Två\tÄGG\r\n\n1 dl  mjölk " })).toBe("två ägg 1 dl mjölk");
    expect(mockKey({ text: "två ägg" })).toMatch(/^[0-9a-f]{64}$/);
    expect(mockKey({ text: "två ägg" })).toBe(mockKey({ text: "  TVÅ   ägg\n" }));
    expect(mockKey({ text: "två ägg" })).not.toBe(mockKey({ text: "tre ägg" }));
  });

  it("includes JSON-LD and has no key for empty input", () => {
    expect(mockKey({ text: "a", jsonLd: "{}" })).not.toBe(mockKey({ text: "a" }));
    expect(mockKey({})).toBeUndefined();
  });
});

describe("AI fixtures", () => {
  it.each(manifest.cases.map(({ name }) => [name]))("%s: the mock's answer meets its own expectations", (name) => {
    const expected = JSON.parse(read(`${name}.expected.json`)) as Expected;
    expect(compare(response(name), expected).filter((check) => !check.ok)).toEqual([]);
  });

  it("lists the default case among the cases", () => {
    expect(manifest.cases.map((testCase) => testCase.name)).toContain(manifest.default);
  });

  it("covers JSON-LD, an image, an injected instruction, a servings range and a recipe without time", () => {
    expect(manifest.cases.some((testCase) => testCase.jsonLd)).toBe(true);
    expect(manifest.cases.some((testCase) => testCase.image)).toBe(true);
    const texts = manifest.cases.map(({ name }) => read(`${name}.txt`)).join("\n");
    expect(texts).toContain("Ignorera tidigare instruktioner");
    expect(texts).toMatch(/\d+–\d+ portioner/);
    expect(manifest.cases.some(({ name }) => response(name).totalMinutes === null)).toBe(true);
  });
});
