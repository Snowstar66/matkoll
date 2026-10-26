import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, ok, type ErrorCode } from "@/lib/errors";
import { normalizeTitle } from "@/lib/suggest-input";
import { aiRecipe, suggestDishesAnswer, type AiRecipe } from "../schemas";
import type { AiService, ParseRecipeInput, SuggestDishesInput } from "../service";

// Deterministic stand-in for a model, used in all tests and in CI (AD-9). It
// answers from tests/fixtures/ai/: manifest.json lists the cases, each with a
// recipe text (<name>.txt), the answer (<name>.response.json) and optionally
// JSON-LD (<name>.jsonld.json) and an image (<name>.png). The key is the
// SHA-256 of the normalized input text (text plus JSON-LD), or of the image
// bytes when there is no text. Unknown input gets the default case. Reserved
// inputs in manifest.json make the mock fail with an error code, so the import
// flow's error messages can be tested end to end; reserved images do the same
// for a photo. suggestDishes answers the three recipes in
// <suggest>.response.json, whatever is at home, or the first set in
// suggestAlternatives none of whose titles is to be avoided (ai_invalid when
// every set has one), unless a pantry item's name is one of the reserved
// inputs for ai_unavailable, ai_invalid or ai_rejected. The suggest fixtures
// are loaded on their own, so a broken one never breaks an import.

/** Error codes the mock can be asked to return through a reserved input. */
export const mockErrorCodes = ["ai_unavailable", "ai_invalid", "ai_rejected", "import_no_recipe"] as const;
type MockErrorCode = (typeof mockErrorCodes)[number] & ErrorCode;

/** The reserved inputs that make suggestDishes fail, as a pantry item's name. */
export const mockSuggestErrorCodes = ["ai_unavailable", "ai_invalid", "ai_rejected"] as const;

type Manifest = {
  default: string;
  cases: { name: string; jsonLd?: boolean; image?: boolean }[];
  reserved: { text: string; code: MockErrorCode }[];
  reservedImages?: { image: string; code: MockErrorCode }[];
  /** The case suggestDishes answers with: <suggest>.response.json. */
  suggest: string;
  /** Further answers, for when every title of the ones before is to be avoided ("Föreslå andra rätter"). */
  suggestAlternatives?: string[];
};

type Answer = { recipe: AiRecipe } | { code: MockErrorCode };
type Fixtures = { byKey: Map<string, Answer>; fallback: AiRecipe };
type SuggestFixtures = {
  /** The answer sets in the order they are tried. */
  sets: AiRecipe[][];
  /** Normalized reserved text → its code, for the pantry items given to suggestDishes. */
  errors: Map<string, MockErrorCode>;
};

export const defaultFixturesDir = join(process.cwd(), "tests", "fixtures", "ai");

/** Normalized input text: Unicode NFC, one space between words, lower case. */
export function normalizeInputText(input: Pick<ParseRecipeInput, "text" | "jsonLd">): string {
  return [input.text, input.jsonLd]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function mockKey(input: ParseRecipeInput): string | undefined {
  const text = normalizeInputText(input);
  if (text) return sha256(text);
  if (input.image) return sha256(input.image.data);
  return undefined;
}

function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function loadFixtures(dir: string): Fixtures {
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as Manifest;
  const byKey = new Map<string, Answer>();
  const recipes = new Map<string, AiRecipe>();

  for (const { name, jsonLd, image } of manifest.cases) {
    const recipe = aiRecipe.parse(JSON.parse(read(`${name}.response.json`)));
    recipes.set(name, recipe);
    const text = read(`${name}.txt`);
    byKey.set(sha256(normalizeInputText({ text, jsonLd: jsonLd ? read(`${name}.jsonld.json`) : undefined })), {
      recipe,
    });
    if (image) byKey.set(sha256(readFileSync(join(dir, `${name}.png`))), { recipe });
  }
  const checked = (code: MockErrorCode) => {
    if (!(mockErrorCodes as readonly string[]).includes(code)) throw new Error("unknown reserved code");
    return { code };
  };
  for (const { text, code } of manifest.reserved) byKey.set(sha256(normalizeInputText({ text })), checked(code));
  for (const { image, code } of manifest.reservedImages ?? []) {
    byKey.set(sha256(readFileSync(join(dir, image))), checked(code));
  }

  const fallback = recipes.get(manifest.default);
  if (!fallback) throw new Error("default case missing");
  return { byKey, fallback };
}

function loadSuggestFixtures(dir: string): SuggestFixtures {
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as Manifest;
  const sets = [manifest.suggest, ...(manifest.suggestAlternatives ?? [])].map(
    (name) => suggestDishesAnswer.parse(JSON.parse(read(`${name}.response.json`))).suggestions,
  );
  const errors = new Map<string, MockErrorCode>();
  for (const { text, code } of manifest.reserved) {
    if ((mockSuggestErrorCodes as readonly string[]).includes(code)) errors.set(normalizeInputText({ text }), code);
  }
  return { sets, errors };
}

/** The error code a reserved pantry item asks for, if any. */
function suggestErrorFor(input: SuggestDishesInput, errors: Map<string, MockErrorCode>): MockErrorCode | undefined {
  for (const item of input.pantry) {
    const code = errors.get(normalizeInputText({ text: item.name }));
    if (code) return code;
  }
  return undefined;
}

/** Loads on first use and remembers a failure too. */
function lazily<T>(load: () => T): () => T | undefined {
  let loaded: { value: T } | { error: true } | undefined;
  return () => {
    if (!loaded) {
      try {
        loaded = { value: load() };
      } catch {
        loaded = { error: true };
      }
    }
    return "value" in loaded ? loaded.value : undefined;
  };
}

export function createMockAiService(dir: string = defaultFixturesDir): AiService {
  // Each loaded once, on first use; a failure is remembered too.
  const fixtures = lazily(() => loadFixtures(dir));
  const suggestFixtures = lazily(() => loadSuggestFixtures(dir));

  /** The fixtures, or undefined (logged) when they cannot be read. */
  const logged = <T>(current: T | undefined) => {
    if (current === undefined) console.error("ai_unavailable", { reason: "fixtures" });
    return current;
  };

  return {
    async parseRecipe(input, signal) {
      if (signal.aborted) return fail("ai_unavailable");
      const current = logged(fixtures());
      if (!current) return fail("ai_unavailable");
      const key = mockKey(input);
      const answer = key ? current.byKey.get(key) : undefined;
      if (answer && "code" in answer) return fail(answer.code);
      // structuredClone: callers may change the result without changing the fixture.
      return ok(structuredClone(answer ? answer.recipe : current.fallback));
    },
    async suggestDishes(input, signal) {
      if (signal.aborted) return fail("ai_unavailable");
      const current = logged(suggestFixtures());
      if (!current) return fail("ai_unavailable");
      const code = suggestErrorFor(input, current.errors);
      if (code) return fail(code);
      // Like a model held to avoidTitles: the first set without one of them.
      const avoided = new Set(input.avoidTitles.map(normalizeTitle));
      const set = current.sets.find((recipes) => recipes.every((recipe) => !avoided.has(normalizeTitle(recipe.title))));
      return set ? ok(structuredClone(set)) : fail("ai_invalid");
    },
  };
}
