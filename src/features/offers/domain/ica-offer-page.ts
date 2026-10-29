import { z } from "zod";
import type { Section } from "@/features/catalog";
import { fail, ok, type Result } from "@/lib/errors";
import { mechanicsSchema, offerSaving } from "./offer-saving";
import { isIsoDate } from "./week";

// Reads the weekly offers out of a store's offer page on ica.se (Story 9.1,
// AD-25, docs/erbjudanden-lankar.md). The page carries its data as a
// JavaScript literal, `window.__INITIAL_DATA__ = {...}`, which is not strict
// JSON: it holds `undefined` and `new Map([...])`. The literal is never run.
// A reader of its own walks it, keeping track of strings and brackets, turns
// the two known constructs outside strings into JSON (`undefined` → `null`,
// `new Map([...])` → the list) and hands the text to JSON.parse. Anything
// else outside a string (another constructor, a function, a comment, a
// template) means the page has changed. Only `offers.weeklyOffers` is
// handed on, each entry checked on its own; everything else in the page
// (its session token, cookies and internal addresses) is dropped here.
// Pure, so it is tested against saved pages without a network.

/**
 * ICA's categories of food and drink, and the store section (AD-12) each
 * stands for when the catalog does not know the item. Everything else ("Hem
 * & fritid", "Hälsa & skönhet") is not food and is only counted. ICA's page
 * says "Bröd, kex & bageri"; "Bröd" stands for the same.
 */
export const FOOD_CATEGORIES: Readonly<Record<string, Section>> = {
  Färskvaror: "Kött och fisk",
  Mejeri: "Mejeri",
  "Frukt & Grönt": "Frukt och grönt",
  "Bröd, kex & bageri": "Bröd",
  Bröd: "Bröd",
  Skafferivaror: "Skafferi",
  Djupfryst: "Frys",
  Dryck: "Dryck",
};

/** A category as compared: lower case, single spaces. */
const categoryKey = (name: string) => name.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
const foodSections = new Map(Object.entries(FOOD_CATEGORIES).map(([name, section]) => [categoryKey(name), section]));

/** The store section of a food category, or `null` for a category that is not food. */
export function foodSection(category: string | null | undefined): Section | null {
  return category ? (foodSections.get(categoryKey(category)) ?? null) : null;
}

/** One offer as the page has it, with only the fields Matkoll uses. */
export type IcaOffer = {
  brand: string;
  name: string;
  /** "89 kr/kg", "2 för 119 kr", "Köp 3 betala för 2". */
  mechanicInfo: string;
  /** "Max 1 köp/hushåll", or "". */
  restriction: string;
  /** ICA's category, e.g. "Färskvaror". */
  category: string;
  /** The offer's last day, YYYY-MM-DD. */
  validTo: string;
  /** The offer is for members ("Stammis"). */
  memberOnly: boolean;
  /** The regular price in kronor ("Ord.pris"), or `null` when the page has none (Story 9.11). */
  regularPrice: number | null;
  /** The saving in whole percent, or `null` when it cannot be stated (Story 9.11). */
  savingPercent: number | null;
};

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? "");

/** One entry of weeklyOffers. Unknown keys are dropped; a wrong shape leaves the entry out. */
const offerSchema = z.object({
  details: z.object({
    brand: text,
    name: z.string().trim().min(1),
    mechanicInfo: text,
  }),
  category: z.object({ articleGroupName: z.string() }),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  restriction: text,
  traits: z.array(z.string()).nullish(),
  // Story 9.11: a wrong shape here only means no saving, never a lost offer.
  parsedMechanics: mechanicsSchema.nullish().catch(null),
  stores: z
    .array(z.object({ regularPrice: z.string().nullish().catch(null) }))
    .nullish()
    .catch(null),
});

const marker = "window.__INITIAL_DATA__";

/** Thrown inside the reader for a literal it does not know; never leaves this file. */
class UnknownConstruct extends Error {}

const identifierStart = /[A-Za-z_$]/;
const identifierPart = /[A-Za-z0-9_$]/;
const passThrough = /[\s,:]/;
const numberPattern = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/;

/**
 * The object literal that starts at `start` (a "{"), as JSON text. Throws
 * UnknownConstruct for anything but strings, numbers, true, false, null,
 * undefined, objects, arrays and `new Map(...)`.
 */
function literalAsJson(source: string, start: number): string {
  const out: string[] = [];
  /** Open brackets; "m" is a `new Map(`, whose ")" is left out. */
  const stack: string[] = [];
  let index = start;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') {
      // A string, copied as it is: JSON.parse reads its escapes.
      let end = index + 1;
      while (end < source.length && source[end] !== '"') end += source[end] === "\\" ? 2 : 1;
      if (end >= source.length) throw new UnknownConstruct();
      out.push(source.slice(index, end + 1));
      index = end + 1;
      continue;
    }
    if (char === "{" || char === "[") {
      stack.push(char);
      out.push(char);
      index += 1;
      continue;
    }
    if (char === "}" || char === "]") {
      if (stack.pop() !== (char === "}" ? "{" : "[")) throw new UnknownConstruct();
      out.push(char);
      index += 1;
      if (stack.length === 0) return out.join("");
      continue;
    }
    if (char === ")") {
      if (stack.pop() !== "m") throw new UnknownConstruct();
      index += 1;
      continue;
    }
    if (char === "-" || (char >= "0" && char <= "9")) {
      const number = numberPattern.exec(source.slice(index, index + 64));
      if (!number) throw new UnknownConstruct();
      out.push(number[0]);
      index += number[0].length;
      continue;
    }
    if (identifierStart.test(char)) {
      let end = index + 1;
      while (end < source.length && identifierPart.test(source[end])) end += 1;
      const word = source.slice(index, end);
      if (word === "true" || word === "false" || word === "null") {
        out.push(word);
        index = end;
        continue;
      }
      if (word === "undefined") {
        out.push("null");
        index = end;
        continue;
      }
      const map = /^new\s+Map\s*\(/.exec(source.slice(index, index + 40));
      if (map) {
        stack.push("m");
        index += map[0].length;
        continue;
      }
      throw new UnknownConstruct();
    }
    if (passThrough.test(char)) {
      out.push(char);
      index += 1;
      continue;
    }
    throw new UnknownConstruct();
  }
  throw new UnknownConstruct();
}

/** The page's data object, or `null` when the page has none or one the reader does not know. */
function initialData(html: string): unknown {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const assignment = /^\s*=\s*/.exec(html.slice(at + marker.length, at + marker.length + 20));
  if (!assignment) return null;
  const start = at + marker.length + assignment[0].length;
  if (html[start] !== "{") return null;
  try {
    return JSON.parse(literalAsJson(html, start)) as unknown;
  } catch {
    // UnknownConstruct, or text JSON.parse cannot read: the page has changed.
    return null;
  }
}

/** A field of an object, or `undefined`. */
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * The page's weekly offers on food, and how many other offers it had
 * (`skipped`). An entry with the wrong shape, or a last day that is not a real date, is left out. `offers_page_changed`
 * when the page has no data, a shape the reader does not know, or entries
 * none of which can be read. An empty list is not an error here.
 */
export function parseIcaOfferPage(html: string): Result<{ offers: IcaOffer[]; skipped: number }> {
  const weekly = field(field(initialData(html), "offers"), "weeklyOffers");
  if (!Array.isArray(weekly)) return fail("offers_page_changed");
  const offers: IcaOffer[] = [];
  let skipped = 0;
  let readable = 0;
  for (const entry of weekly) {
    const parsed = offerSchema.safeParse(entry);
    // A date that does not exist (2026-02-30) leaves the entry out, as a wrong shape does.
    if (!parsed.success || !isIsoDate(parsed.data.validTo.slice(0, 10))) continue;
    readable += 1;
    const { details, category, validTo, restriction, traits, parsedMechanics, stores } = parsed.data;
    if (!foodSection(category.articleGroupName)) {
      skipped += 1;
      continue;
    }
    offers.push({
      brand: details.brand,
      name: details.name,
      mechanicInfo: details.mechanicInfo,
      restriction,
      category: category.articleGroupName,
      validTo: validTo.slice(0, 10),
      memberOnly: (traits ?? []).includes("Stammis"),
      ...offerSaving(parsedMechanics, stores?.[0]?.regularPrice, details.mechanicInfo),
    });
  }
  if (weekly.length > 0 && readable === 0) return fail("offers_page_changed");
  return ok({ offers, skipped });
}
