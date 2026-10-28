import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/features/catalog";
import {
  FOOD_CATEGORIES,
  maxOfferLabelChars,
  maxOfferNameChars,
  maxOfferNoteChars,
  maxOfferPriceChars,
  maxOffersPerWeek,
  OFFER_SOURCES,
} from "@/features/offers";
import { maxOffersUrlLength } from "@/features/settings";

// AD-12, AD-25, Story 9.1: store_offer's checks and save_store_offers say the
// same as the offers domain, so the database and the code never drift apart.
// Each constraint is read from the latest migration that (re)defines it.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const sqlFiles = () =>
  readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }));

/** The constraint's body in the latest migration that defines it, from `check (` to the matching `)`. */
function latestBody(name: string): { file: string; body: string } {
  const latest = sqlFiles()
    .filter(({ sql }) => sql.includes(`constraint ${name} check (`))
    .at(-1);
  if (!latest) throw new Error(`No migration defines ${name}`);
  const start = latest.sql.lastIndexOf(`constraint ${name} check (`);
  let depth = 0;
  for (let index = latest.sql.indexOf("(", start); index < latest.sql.length; index += 1) {
    if (latest.sql[index] === "(") depth += 1;
    if (latest.sql[index] === ")") depth -= 1;
    if (depth === 0) return { file: latest.file, body: latest.sql.slice(start, index + 1) };
  }
  throw new Error(`Unbalanced ${name}`);
}

const quoted = (text: string) => [...text.matchAll(/'([^']*)'/g)].map((value) => value[1]);

describe("store_offer constraints", () => {
  it.each([
    ["store_offer_label_check", "label", maxOfferLabelChars],
    ["store_offer_name_check", "name", maxOfferNameChars],
    ["store_offer_price_check", "price", maxOfferPriceChars],
    ["store_offer_note_check", "note", maxOfferNoteChars],
    ["store_offers_url_check", "offers_url", maxOffersUrlLength],
  ])("limits %s to the domain's length", (constraint, column, max) => {
    const { file, body } = latestBody(constraint);
    const limit = new RegExp(`char_length\\(${column}\\) <= (\\d+)`).exec(body);
    expect(limit, `the limit in ${file}`).not.toBeNull();
    expect(Number(limit![1]), file).toBe(max);
  });

  it("lists exactly the store sections, in order", () => {
    const { file, body } = latestBody("store_offer_section_check");
    expect(quoted(body), file).toEqual([...SECTIONS]);
  });

  it("lists exactly OFFER_SOURCES", () => {
    const { file, body } = latestBody("store_offer_source_check");
    expect(quoted(body), file).toEqual([...OFFER_SOURCES]);
  });

  it("keeps week_start a Monday", () => {
    expect(latestBody("store_offer_week_start_check").body).toContain("extract(isodow from week_start) = 1");
  });
});

describe("save_store_offers", () => {
  const latest = () => sqlFiles().filter(({ sql }) => sql.includes("function public.save_store_offers(")).at(-1)!;

  it("refuses more than maxOffersPerWeek offers for a store and week", () => {
    expect(latest().sql).toMatch(new RegExp(`if total > ${maxOffersPerWeek} then`));
  });

  it("counts today in Swedish time", () => {
    expect(latest().sql).toContain("(now() at time zone 'Europe/Stockholm')::date");
  });

  it("allows the same replace_source values as OFFER_SOURCES", () => {
    const list = /replace_source not in \(([^)]*)\)/.exec(latest().sql);
    expect(list).not.toBeNull();
    expect(quoted(list![1])).toEqual([...OFFER_SOURCES]);
  });
});

describe("FOOD_CATEGORIES", () => {
  it("maps every food category to a store section", () => {
    for (const section of Object.values(FOOD_CATEGORIES)) expect(SECTIONS).toContain(section);
    expect(Object.keys(FOOD_CATEGORIES)).toEqual(
      expect.arrayContaining(["Färskvaror", "Mejeri", "Frukt & Grönt", "Bröd, kex & bageri", "Skafferivaror", "Djupfryst", "Dryck"]),
    );
    expect(Object.keys(FOOD_CATEGORIES)).not.toContain("Hem & fritid");
    expect(Object.keys(FOOD_CATEGORIES)).not.toContain("Hälsa & skönhet");
  });
});
