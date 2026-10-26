import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compare, type Expected } from "../../../../tests/eval/compare";
import { aiRecipe } from "../schemas";
import { createMockAiService, defaultFixturesDir, mockErrorCodes, mockKey, normalizeInputText } from "./mock";

const dir = defaultFixturesDir;
const read = (file: string) => readFileSync(join(dir, file), "utf8");
const response = (name: string) => aiRecipe.parse(JSON.parse(read(`${name}.response.json`)));
type Manifest = {
  default: string;
  cases: { name: string; jsonLd?: boolean; image?: boolean }[];
  reserved: { text: string; code: string }[];
  reservedImages: { image: string; code: string }[];
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
