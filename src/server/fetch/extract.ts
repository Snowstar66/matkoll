import "server-only";
import * as cheerio from "cheerio";

// Reads a fetched recipe page (AD-11): the schema.org/Recipe JSON-LD, if the
// page has it, and the page's readable text. Both are input to the AI port's
// parseRecipe; the JSON-LD is never used as a RecipeDraft directly (AD-10).

export type ExtractedPage = {
  /** The page's readable text, one block per line. */
  text: string;
  /** The Recipe object from the page's JSON-LD, as JSON, or `null` when there is none or it does not fit. */
  jsonLd: string | null;
  /** The recipe's image (https, at most 2 048 characters) from the JSON-LD or og:image, or `null`. */
  imageUrl: string | null;
};

/** The AI port's limit for text and JSON-LD together (inputLimits.maxTextChars). */
export const defaultMaxChars = 12_000;

/** JSON-LD gets at most this share of the budget; the text gets the rest. */
const jsonLdShare = 0.6;

/**
 * The text's budget when the JSON-LD already has the ingredients and the
 * steps: the text then only adds what the JSON-LD lacks (e.g. headings in
 * the ingredient list), and the model gets less to read.
 */
export const textWithRecipeJsonLdChars = 2_000;

/** Longest image address, the same as a saved recipe's image_url. */
const maxImageUrlChars = 2_048;

/** Code and styling, and asides: never the recipe, wherever they are. */
const removedEverywhere =
  "script, style, noscript, template, svg, iframe, aside, [role=banner], [role=contentinfo], [role=navigation]";

/** The page's own header, footer and menus; inside main or article they belong to the recipe and are kept. */
const pageChrome = "header, footer, nav";

/** Elements that start a new line in the text. */
const blocks =
  "address, article, blockquote, dd, details, dialog, div, dl, dt, fieldset, figcaption, figure, form, h1, h2, h3, h4, h5, h6, header, footer, hr, li, main, ol, p, pre, section, summary, table, tbody, td, th, thead, tr, ul";

/** Properties of a Recipe that are not the recipe: reviews, ratings, nutrition, video, people and links. */
const noise = new Set([
  "@context",
  "aggregateRating",
  "author",
  "comment",
  "creator",
  "interactionStatistic",
  "isPartOf",
  "mainEntityOfPage",
  "nutrition",
  "potentialAction",
  "publisher",
  "review",
  "video",
]);

/** The recipe itself; never shortened. */
const recipeLists = new Set(["recipeIngredient", "recipeInstructions"]);

/** Other lists are cut to this many items when the JSON-LD is too long. */
const shortList = 3;

/** Properties dropped last, when the JSON-LD is still too long. */
const extras = ["description", "keywords", "recipeCategory", "recipeCuisine", "image", "suitableForDiet"];

type Node = Record<string, unknown>;

function isRecipe(node: Node): boolean {
  const type = node["@type"];
  const types = Array.isArray(type) ? type : [type];
  return types.some((value) => typeof value === "string" && /(^|[/:])Recipe$/.test(value));
}

/** The first Recipe in a JSON-LD value: at the top, in a list or in `@graph`, at any depth. */
function findRecipe(value: unknown, depth = 0): Node | null {
  if (depth > 8 || value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = value as Node;
  if (isRecipe(node)) return node;
  for (const key of ["@graph", "mainEntity", "itemListElement", "item"]) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

/** Every node with an `@id` in a JSON-LD value, so references (`{ "@id": … }`) can be followed. */
function collectIds(value: unknown, ids: Map<string, Node>, depth = 0): Map<string, Node> {
  if (depth > 8 || value === null || typeof value !== "object") return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids, depth + 1);
    return ids;
  }
  const node = value as Node;
  if (typeof node["@id"] === "string" && Object.keys(node).length > 1) ids.set(node["@id"], node);
  for (const child of Object.values(node)) collectIds(child, ids, depth + 1);
  return ids;
}

/** An https address of at most 2 048 characters, as written, or `null`. */
function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.href.length <= maxImageUrlChars ? url.href : null;
  } catch {
    return null;
  }
}

/** The first https address among the forms schema.org allows for `image`, following `@id` references. */
function imageOf(value: unknown, ids: ReadonlyMap<string, Node>, depth = 0): string | null {
  if (depth > 4 || value === null || value === undefined) return null;
  if (typeof value === "string") return httpsUrl(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageOf(item, ids, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    let node = value as Node;
    const ref = node["@id"];
    if (typeof ref === "string" && node.url === undefined && node.contentUrl === undefined && ids.has(ref)) {
      node = ids.get(ref) as Node;
    }
    return imageOf(node.url, ids, depth + 1) ?? imageOf(node.contentUrl, ids, depth + 1);
  }
  return null;
}

/** The Recipe from the page's JSON-LD, with the `@id` nodes of the document it was found in. */
function recipeFromJsonLd($: cheerio.CheerioAPI): { recipe: Node; ids: Map<string, Node> } | null {
  for (const element of $("script").toArray()) {
    const type = $(element).attr("type")?.split(";")[0].trim().toLowerCase();
    if (type !== "application/ld+json") continue;
    let value: unknown;
    try {
      value = JSON.parse($(element).text());
    } catch {
      continue;
    }
    const recipe = findRecipe(value);
    if (recipe) return { recipe, ids: collectIds(value, new Map()) };
  }
  return null;
}

/** JSON without the properties in `drop` (at any depth), with other lists than the recipe's cut to `listLimit` items. */
function stringify(recipe: Node, drop: ReadonlySet<string>, listLimit?: number): string {
  return JSON.stringify(recipe, (key, value: unknown) => {
    if (drop.has(key)) return undefined;
    if (listLimit !== undefined && Array.isArray(value) && !recipeLists.has(key)) return value.slice(0, listLimit);
    return value;
  });
}

/**
 * The Recipe as JSON within `max` characters, made smaller step by step and
 * never cut in the middle: first without the noise, then with short lists,
 * then without the extras. `null` when even that does not fit.
 */
function fitJsonLd(recipe: Node, max: number): string | null {
  const attempts = [
    () => stringify(recipe, noise),
    () => stringify(recipe, noise, shortList),
    () => stringify(recipe, new Set([...noise, ...extras]), shortList),
  ];
  for (const attempt of attempts) {
    const json = attempt();
    if (json.length <= max) return json;
  }
  return null;
}

/** True when the JSON-LD has both the ingredients and the steps. */
function hasIngredientsAndSteps(recipe: Node): boolean {
  const filled = (value: unknown) => (Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim() !== "");
  return filled(recipe.recipeIngredient) && filled(recipe.recipeInstructions);
}

function readableText($: cheerio.CheerioAPI): string {
  $(removedEverywhere).remove();
  $(pageChrome)
    .filter((_, element) => $(element).parents("main, article").length === 0)
    .remove();
  $("*")
    .contents()
    .filter((_, node) => node.type === "comment")
    .remove();
  $("br").replaceWith("\n");
  $(blocks).each((_, element) => {
    $(element).prepend("\n").append("\n");
  });
  const body = $("body");
  const all = body.length > 0 ? body.text() : $.root().text();
  const lines: string[] = [];
  for (const raw of all.split("\n")) {
    const line = raw.replace(/\s+/g, " ").trim();
    // The same line twice in a row (e.g. a heading repeated for mobile) is kept once.
    if (line && line !== lines.at(-1)) lines.push(line);
  }
  return lines.join("\n");
}

/** `text` cut to at most `max` characters, at the end of a line when there is one. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lineEnd = slice.lastIndexOf("\n");
  return (lineEnd > max / 2 ? slice.slice(0, lineEnd) : slice).trim();
}

/**
 * The page's Recipe JSON-LD and readable text, within `maxChars` together:
 * the JSON-LD gets up to 60 % of it (made smaller, or left out, when it is
 * longer), and the text the rest, or at most 2 000 characters when the
 * JSON-LD already has the ingredients and the steps. The image comes from the
 * JSON-LD, or else from og:image.
 */
export function extractRecipePage(html: string, maxChars: number = defaultMaxChars): ExtractedPage {
  const $ = cheerio.load(html);
  const found = recipeFromJsonLd($);
  const jsonLd = found ? fitJsonLd(found.recipe, Math.floor(maxChars * jsonLdShare)) : null;
  const rest = maxChars - (jsonLd?.length ?? 0);
  const textBudget = jsonLd && found && hasIngredientsAndSteps(found.recipe) ? Math.min(textWithRecipeJsonLdChars, rest) : rest;
  const ogImage = $('meta[property="og:image"]').attr("content");
  const imageUrl = (found ? imageOf(found.recipe.image, found.ids) : null) ?? httpsUrl(ogImage);
  const text = cut(readableText($), textBudget);
  return { text, jsonLd, imageUrl };
}
