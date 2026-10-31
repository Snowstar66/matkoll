import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fail, ok, type ErrorCode, type Result } from "@/lib/errors";
import { normalizeTitle } from "@/lib/suggest-input";
import {
  aiRecipe,
  analyzeImageAnswer,
  listThingsAnswer,
  locateItemsAnswer,
  parseAnalyzeItems,
  parseItemPositions,
  parseThings,
  suggestDishesAnswerCompact,
  type AiRecipe,
  type LocateItemsAnswer,
} from "../schemas";
import { fromCompactDish } from "../compact-dish";
import { reportUsage } from "../usage";
import type { AiService, AnalyzeImageResult, AskThingsInput, AskThingsResult, CategorizeThingsInput, CategorizeThingsResult, ThingSearchTermsInput, ThingSearchTermsResult, ListThingsResult, MergeThingsInput, MergeThingsResult, ParseRecipeInput, SuggestDishesInput } from "../service";

// Deterministic stand-in for a model, used in all tests and in CI (AD-9). It
// answers from tests/fixtures/ai/: manifest.json lists the cases, each with a
// recipe text (<name>.txt), the answer (<name>.response.json) and optionally
// JSON-LD (<name>.jsonld.json) and an image (<name>.png). The key is the
// SHA-256 of the normalized input text (text plus JSON-LD), or of the image
// bytes when there is no text. Unknown input gets the default case. Reserved
// inputs in manifest.json make the mock fail with an error code, so the import
// flow's error messages can be tested end to end; reserved images do the same
// for a photo. suggestDishes answers the three recipes in
// <suggest>.response.json, whatever is at home, written as a model answers
// them (the compact form of Story 12.3) and turned into AiRecipe with the
// port's own fromCompactDish, or the first set in
// suggestAlternatives none of whose titles is to be avoided (ai_invalid when
// every set has one), unless a pantry item's name is one of the reserved
// inputs for ai_unavailable, ai_invalid or ai_rejected. listThings (Story 18.2) answers one fixture, <things>.things.json, for any
// photo, and the reserved images give their error codes. analyzeImage answers
// from the manifest's `analyze` part: <name>.analyze.json for the photo
// <name>.png, keyed on the SHA-256 of the image bytes, and the default case
// for any other photo, read through parseAnalyzeItems like a model's answer,
// so repeated labels are merged and counted as the port does (Story 6.5);
// the reserved images for ai_unavailable, ai_invalid and
// ai_rejected give their codes (import_no_recipe means nothing to a photo of
// a place, so it gets the default answer). locateItems (Story 6.6) answers
// from the manifest's `locate` part the same way: <name>.locate.json for the
// photo <name>.png, the default case for any other photo, read through
// parseItemPositions for the labels given, like a model's answer, and the
// same reserved images give the same codes. The suggest, analyze and locate
// fixtures are each loaded on their own, so a broken one never breaks an
// import.

/** Error codes the mock can be asked to return through a reserved input. */
export const mockErrorCodes = ["ai_unavailable", "ai_invalid", "ai_rejected", "import_no_recipe"] as const;
type MockErrorCode = (typeof mockErrorCodes)[number] & ErrorCode;

/** The reserved inputs that make suggestDishes fail, as a pantry item's name. */
export const mockSuggestErrorCodes = ["ai_unavailable", "ai_invalid", "ai_rejected"] as const;

/** The reserved images that make analyzeImage fail. */
export const mockAnalyzeErrorCodes = ["ai_unavailable", "ai_invalid", "ai_rejected"] as const;

type Manifest = {
  default: string;
  cases: { name: string; jsonLd?: boolean; image?: boolean }[];
  reserved: { text: string; code: MockErrorCode }[];
  reservedImages?: { image: string; code: MockErrorCode }[];
  /** The case suggestDishes answers with: <suggest>.response.json. */
  suggest: string;
  /** Further answers, for when every title of the ones before is to be avoided ("Föreslå andra rätter"). */
  suggestAlternatives?: string[];
  /** The answer when the message has offers (Story 9.5): <suggestOffers>.response.json. */
  suggestOffers?: string;
  /** The answer when the message has old items (Story 16.13): <suggestOld>.response.json, with dishes that use them. */
  suggestOld?: string;
  /** analyzeImage: each case is a photo <name>.png with the answer <name>.analyze.json; `default` answers any other photo. */
  analyze?: { default: string; cases: { name: string }[] };
  /** locateItems: each case is a photo <name>.png with the points <name>.locate.json; `default` answers any other photo. */
  locate?: { default: string; cases: { name: string }[] };
  /** listThings (Story 18.2): the answer <things>.things.json for any photo that is not a reserved image. */
  things?: string;
};

type Answer = { recipe: AiRecipe } | { code: MockErrorCode };
type Fixtures = { byKey: Map<string, Answer>; fallback: AiRecipe };
type SuggestFixtures = {
  /** The answer sets in the order they are tried. */
  sets: AiRecipe[][];
  /** The answer for a message with offers, if the manifest has one. */
  offersSet: AiRecipe[] | undefined;
  /** The answer for a message with items that have lain long (Story 16.13), if the manifest has one. */
  oldSet: AiRecipe[] | undefined;
  /** Normalized reserved text → its code, for the pantry items given to suggestDishes. */
  errors: Map<string, MockErrorCode>;
};
/** A fixture's answer: its items after parseAnalyzeItems, and how many repeats were merged. */
type AnalyzeAnswer = Pick<AnalyzeImageResult, "items" | "repeated">;
type AnalyzeFixtures = {
  /** SHA-256 of the image bytes → the answer or an error code. */
  byKey: Map<string, AnalyzeAnswer | { code: MockErrorCode }>;
  fallback: AnalyzeAnswer;
};

type LocateFixtures = {
  /** SHA-256 of the image bytes → the model's points or an error code. */
  byKey: Map<string, LocateItemsAnswer | { code: MockErrorCode }>;
  fallback: LocateItemsAnswer;
};

type ThingsFixtures = {
  /** SHA-256 of the image bytes → an error code, for the reserved images. */
  errors: Map<string, MockErrorCode>;
  answer: Omit<ListThingsResult, "invalid" | "trimmed">;
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
    (name) => suggestDishesAnswerCompact.parse(JSON.parse(read(`${name}.response.json`))).suggestions.map(fromCompactDish),
  );
  const offersSet = manifest.suggestOffers
    ? suggestDishesAnswerCompact.parse(JSON.parse(read(`${manifest.suggestOffers}.response.json`))).suggestions.map(fromCompactDish)
    : undefined;
  const oldSet = manifest.suggestOld
    ? suggestDishesAnswerCompact.parse(JSON.parse(read(`${manifest.suggestOld}.response.json`))).suggestions.map(fromCompactDish)
    : undefined;
  const errors = new Map<string, MockErrorCode>();
  for (const { text, code } of manifest.reserved) {
    if ((mockSuggestErrorCodes as readonly string[]).includes(code)) errors.set(normalizeInputText({ text }), code);
  }
  return { sets, offersSet, oldSet, errors };
}

function loadAnalyzeFixtures(dir: string): AnalyzeFixtures {
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as Manifest;
  if (!manifest.analyze) throw new Error("analyze missing");
  const byKey: AnalyzeFixtures["byKey"] = new Map();
  const answers = new Map<string, AnalyzeAnswer>();
  for (const { name } of manifest.analyze.cases) {
    const { items, invalid, repeated } = parseAnalyzeItems(analyzeImageAnswer.parse(JSON.parse(read(`${name}.analyze.json`))).items);
    // Every item must pass on its own: a fixture is a valid answer.
    if (invalid > 0) throw new Error("invalid analyze fixture");
    answers.set(name, { items, repeated });
    byKey.set(sha256(readFileSync(join(dir, `${name}.png`))), { items, repeated });
  }
  for (const { image, code } of manifest.reservedImages ?? []) {
    if ((mockAnalyzeErrorCodes as readonly string[]).includes(code)) {
      byKey.set(sha256(readFileSync(join(dir, image))), { code });
    }
  }
  const fallback = answers.get(manifest.analyze.default);
  if (!fallback) throw new Error("default case missing");
  return { byKey, fallback };
}

function loadLocateFixtures(dir: string): LocateFixtures {
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as Manifest;
  if (!manifest.locate) throw new Error("locate missing");
  const byKey: LocateFixtures["byKey"] = new Map();
  const answers = new Map<string, LocateItemsAnswer>();
  for (const { name } of manifest.locate.cases) {
    const answer = locateItemsAnswer.parse(JSON.parse(read(`${name}.locate.json`)));
    // Every point must pass for as many labels as it has points: a fixture is a valid answer.
    if (parseItemPositions(answer.positions, answer.positions.length).invalid > 0) throw new Error("invalid locate fixture");
    answers.set(name, answer);
    byKey.set(sha256(readFileSync(join(dir, `${name}.png`))), answer);
  }
  for (const { image, code } of manifest.reservedImages ?? []) {
    if ((mockAnalyzeErrorCodes as readonly string[]).includes(code)) {
      byKey.set(sha256(readFileSync(join(dir, image))), { code });
    }
  }
  const fallback = answers.get(manifest.locate.default);
  if (!fallback) throw new Error("default case missing");
  return { byKey, fallback };
}

function loadThingsFixtures(dir: string): ThingsFixtures {
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  const manifest = JSON.parse(read("manifest.json")) as Manifest;
  if (!manifest.things) throw new Error("things missing");
  const parsed = parseThings(listThingsAnswer.parse(JSON.parse(read(`${manifest.things}.things.json`))));
  // Every thing must pass on its own: a fixture is a valid answer.
  if (parsed.invalid > 0) throw new Error("invalid things fixture");
  const errors = new Map<string, MockErrorCode>();
  for (const { image, code } of manifest.reservedImages ?? []) {
    if ((mockAnalyzeErrorCodes as readonly string[]).includes(code)) errors.set(sha256(readFileSync(join(dir, image))), code);
  }
  return { errors, answer: parsed };
}

/**
 * askThings (Story 18.4) without a model: the places whose things have a word
 * of the question in their name (a word of four letters or more matches by its
 * first four, so "måla" finds "Målarfärgsburkar"), named in a fixed sentence
 * with the closed containers added when a place has any; or "Jag hittar inget
 * som passar." A question that holds a reserved text of the manifest fails
 * with its code.
 */
/** Small words that would match inside a name ("att" in "Kratta"). */
const mockStopWords = new Set(["har", "att", "med", "och", "det", "den", "ett", "som", "var", "finns", "något", "någon", "några", "ligger", "kan", "till", "för", "inte"]);

function mockAskAnswer(input: AskThingsInput): AskThingsResult {
  const words = input.question
    .normalize("NFC")
    .toLocaleLowerCase("sv")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !mockStopWords.has(word))
    .map((word) => (word.length > 4 ? word.slice(0, 4) : word));
  const found = input.places.flatMap((place, index) => {
    const names = place.things.filter((thing) => words.some((word) => thing.name.toLocaleLowerCase("sv").includes(word))).map((thing) => thing.name);
    return names.length > 0 ? [{ place, index, names }] : [];
  });
  if (found.length === 0) {
    // The chat (Story 18.14) names the closed containers too.
    const boxes = (input.unseen ?? []).reduce((sum, entry) => sum + entry.count, 0);
    const where = boxes > 0 ? ` Innehållet i ${boxes === 1 ? "en låda" : `${boxes} lådor`} syns inte, så där kan det ligga.` : "";
    return { answer: `Jag hittar inget som passar i dina listor.${where}`, places: [] };
  }
  const sentences = found.slice(0, 3).map(({ place, names }) => {
    const hidden = place.hidden > 0 ? ` Innehållet i ${place.hidden === 1 ? "en låda" : `${place.hidden} lådor`} syns inte, så där kan det också ligga något.` : "";
    return `${names.slice(0, 3).join(", ")} finns i ${place.title} (${place.site}).${hidden}`;
  });
  return { answer: sentences.join(" "), places: found.slice(0, 5).map(({ index }) => index) };
}

/**
 * thingSearchTerms (Story 18.14) without a model: the words of the question
 * that are not small words (and not "då", "och", "sett"), once each, at most
 * eight. A follow-up has its own words, so the history is not used.
 */
const mockTermStopWords = new Set([...mockStopWords, "sett", "hittar", "vet", "jag", "du", "vi", "ni", "min", "mina", "vår", "våra", "då", "var", "hur", "vad", "finns", "har"]);

function mockSearchTerms(input: ThingSearchTermsInput): ThingSearchTermsResult {
  const words = input.question
    .normalize("NFC")
    .toLocaleLowerCase("sv")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= 2 && !mockTermStopWords.has(word));
  return { terms: [...new Set(words)].slice(0, 8) };
}

/**
 * categorizeThings (Story 18.13) without a model: a few words of each name
 * pick the category; anything else is "Övrigt".
 */
const mockCategoryWords: [RegExp, CategorizeThingsResult["categories"][number]][] = [
  [/hammare|skruv|borr|tång|nyckel|såg|mejsel|verktyg/, "Verktyg"],
  [/boll|cykel|skid|racket|fiske|tält/, "Sport & fritid"],
  [/kratta|spade|slang|kruka|gräs|lövblås/, "Trädgård"],
  [/sladd|lampa|batteri|belysning|laddare|kabel/, "Elektronik"],
  [/låda|back|korg|kartong|burk/, "Förvaring & lådor"],
  [/jacka|mössa|handske|kläder|strumpor|sjal/, "Kläder & textil"],
  [/disk|städ|handduk|ljusstake|ljus/, "Hushåll"],
  [/plank|spik|bräd|cement|färg/, "Byggmaterial"],
];

function mockCategories(input: CategorizeThingsInput): CategorizeThingsResult {
  return {
    categories: input.names.map((name) => {
      const lower = name.toLocaleLowerCase("sv");
      return mockCategoryWords.find(([pattern]) => pattern.test(lower))?.[1] ?? "Övrigt";
    }),
  };
}

/**
 * mergeThings (Story 18.6) without a model: a thing of the new card and a kept
 * thing with the same name (the same text in lower case) are the same thing,
 * each in at most one pair.
 */
function mockMergePairs(input: MergeThingsInput): MergeThingsResult {
  const taken = new Set<number>();
  const pairs: MergeThingsResult["pairs"] = [];
  input.added.forEach((thing, added) => {
    const key = thing.name.toLocaleLowerCase("sv");
    const existing = input.existing.findIndex((other, index) => !taken.has(index) && other.name.toLocaleLowerCase("sv") === key);
    if (existing < 0) return;
    taken.add(existing);
    pairs.push({ added, existing });
  });
  return { pairs };
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

/** The most AI_MOCK_DELAY_MS may be (AD-14), in milliseconds. */
export const maxMockDelayMs = 30_000;

/**
 * Waits `ms`, or until `signal` aborts. True when the time passed: a call
 * that is stopped ("Avbryt", a job that was cancelled) gives up at once.
 */
function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!signal.aborted);
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (passed: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(passed);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(true), ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const clampedDelay = (ms: number) => Math.min(Math.max(ms, 0), maxMockDelayMs);

export type MockOptions = {
  /**
   * Time every AI-förslag call and every recipe import takes (AI_MOCK_DELAY_MS,
   * Stories 12.4 and 12.6), so the queue and the job row can be tried in the
   * end-to-end tests. Story 12.5: also a photo the mock does not know (not one
   * of the cases, not a reserved image), for the reading and for the numbers
   * each, so the queue of photos can be seen; the photos of the cases answer
   * at once, so the other end-to-end tests stay quick.
   */
  delayMs?: number;
};

/**
 * Story 17.6: a call that answered counts as a call of the model "mock" with
 * no tokens, so the usage rows can be tried without a real model. It costs 0 kr.
 */
function countingCalls(service: AiService): AiService {
  const counted = <Args extends unknown[], T>(call: (...args: Args) => Promise<Result<T>>) =>
    async (...args: Args): Promise<Result<T>> => {
      const result = await call(...args);
      if (result.ok) await reportUsage({ model: "mock", inputTokens: 0, outputTokens: 0 });
      return result;
    };
  return {
    ...service,
    parseRecipe: counted(service.parseRecipe),
    suggestDishes: counted(service.suggestDishes),
    analyzeImage: counted(service.analyzeImage),
    locateItems: counted(service.locateItems),
    listThings: counted(service.listThings),
    askThings: counted(service.askThings),
    mergeThings: counted(service.mergeThings),
    thingSearchTerms: counted(service.thingSearchTerms),
    categorizeThings: counted(service.categorizeThings),
  };
}

export function createMockAiService(dir: string = defaultFixturesDir, options: MockOptions = {}): AiService {
  return countingCalls(createMockService(dir, options));
}

function createMockService(dir: string, { delayMs = 0 }: MockOptions): AiService {
  // Each loaded once, on first use; a failure is remembered too.
  const fixtures = lazily(() => loadFixtures(dir));
  const suggestFixtures = lazily(() => loadSuggestFixtures(dir));
  const analyzeFixtures = lazily(() => loadAnalyzeFixtures(dir));
  const locateFixtures = lazily(() => loadLocateFixtures(dir));
  const thingsFixtures = lazily(() => loadThingsFixtures(dir));
  // The suggest fixtures hold the reserved texts askThings fails on (a question that contains one).
  const askErrors = lazily(() => loadSuggestFixtures(dir).errors);

  /** The fixtures, or undefined (logged) when they cannot be read. */
  const logged = <T>(current: T | undefined) => {
    if (current === undefined) console.error("ai_unavailable", { reason: "fixtures" });
    return current;
  };

  return {
    async parseRecipe(input, signal) {
      if (!(await wait(Math.min(Math.max(delayMs, 0), maxMockDelayMs), signal))) return fail("ai_unavailable");
      const current = logged(fixtures());
      if (!current) return fail("ai_unavailable");
      const key = mockKey(input);
      const answer = key ? current.byKey.get(key) : undefined;
      if (answer && "code" in answer) return fail(answer.code);
      // structuredClone: callers may change the result without changing the fixture.
      return ok(structuredClone(answer ? answer.recipe : current.fallback));
    },
    async suggestDishes(input, signal) {
      if (!(await wait(clampedDelay(delayMs), signal))) return fail("ai_unavailable");
      const current = logged(suggestFixtures());
      if (!current) return fail("ai_unavailable");
      const code = suggestErrorFor(input, current.errors);
      if (code) return fail(code);
      // Offers given: the answer built around them (Story 9.5), never an avoided title.
      if (input.offers && input.offers.length > 0 && current.offersSet) {
        const taken = new Set(input.avoidTitles.map(normalizeTitle));
        return current.offersSet.every((recipe) => !taken.has(normalizeTitle(recipe.title)))
          ? ok(structuredClone(current.offersSet))
          : fail("ai_invalid");
      }
      // Old items given (Story 16.13): the answer that uses them, never an avoided title.
      if (input.oldItems && input.oldItems.length > 0 && current.oldSet) {
        const taken = new Set(input.avoidTitles.map(normalizeTitle));
        if (current.oldSet.every((recipe) => !taken.has(normalizeTitle(recipe.title)))) return ok(structuredClone(current.oldSet));
      }
      // Like a model held to avoidTitles: the first set without one of them.
      const avoided = new Set(input.avoidTitles.map(normalizeTitle));
      const set = current.sets.find((recipes) => recipes.every((recipe) => !avoided.has(normalizeTitle(recipe.title))));
      return set ? ok(structuredClone(set)) : fail("ai_invalid");
    },
    async analyzeImage(input, signal) {
      if (signal.aborted) return fail("ai_unavailable");
      const current = logged(analyzeFixtures());
      if (!current) return fail("ai_unavailable");
      const answer = current.byKey.get(sha256(input.image.data));
      if (!answer && !(await wait(clampedDelay(delayMs), signal))) return fail("ai_unavailable");
      if (answer && "code" in answer) return fail(answer.code);
      const { items, repeated } = answer ?? current.fallback;
      return ok({ items: structuredClone(items), invalid: 0, repeated });
    },
    async locateItems(input, signal) {
      if (signal.aborted) return fail("ai_unavailable");
      const current = logged(locateFixtures());
      if (!current) return fail("ai_unavailable");
      const answer = current.byKey.get(sha256(input.image.data));
      if (!answer && !(await wait(clampedDelay(delayMs), signal))) return fail("ai_unavailable");
      if (answer && "code" in answer) return fail(answer.code);
      // Like a model's answer: a point for a number beyond the labels is left out and counted.
      return ok(parseItemPositions((answer ?? current.fallback).positions, input.labels.length));
    },
    async listThings(input, signal) {
      if (signal.aborted) return fail("ai_unavailable");
      const current = logged(thingsFixtures());
      if (!current) return fail("ai_unavailable");
      const code = current.errors.get(sha256(input.image.data));
      // A photo the mock does not know takes the delay, so a reading can be seen in progress.
      if (!code && !(await wait(clampedDelay(delayMs), signal))) return fail("ai_unavailable");
      if (code) return fail(code);
      return ok({ ...structuredClone(current.answer), invalid: 0, trimmed: 0 });
    },
    async askThings(input, signal) {
      if (!(await wait(clampedDelay(Math.min(delayMs, 1_000)), signal))) return fail("ai_unavailable");
      const errors = logged(askErrors());
      if (!errors) return fail("ai_unavailable");
      const question = normalizeInputText({ text: input.question });
      for (const [text, code] of errors) if (question.includes(text)) return fail(code);
      return ok(mockAskAnswer(input));
    },
    async mergeThings(input, signal) {
      if (!(await wait(clampedDelay(Math.min(delayMs, 1_000)), signal))) return fail("ai_unavailable");
      return ok(mockMergePairs(input));
    },
    async thingSearchTerms(input, signal) {
      if (!(await wait(clampedDelay(Math.min(delayMs, 1_000)), signal))) return fail("ai_unavailable");
      const errors = logged(askErrors());
      if (!errors) return fail("ai_unavailable");
      const question = normalizeInputText({ text: input.question });
      for (const [text, code] of errors) if (question.includes(text)) return fail(code);
      return ok(mockSearchTerms(input));
    },
    async categorizeThings(input, signal) {
      if (!(await wait(clampedDelay(Math.min(delayMs, 1_000)), signal))) return fail("ai_unavailable");
      const errors = logged(askErrors());
      if (!errors) return fail("ai_unavailable");
      // A name that holds a reserved text fails with its code, so "AI svarar inte" can be tried.
      const names = normalizeInputText({ text: input.names.join(" ") });
      for (const [text, code] of errors) if (names.includes(text)) return fail(code);
      return ok(mockCategories(input));
    },
    // Story 12.2: the mock is never cold, so there is nothing to wake.
    warmUpKey() {
      return null;
    },
    async warmUp() {
      return { outcome: "skipped", reason: "provider" };
    },
  };
}
