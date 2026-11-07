// One-off generator for the nutrition data (run by hand, never at runtime, never in CI):
//
//   node scripts/nutrition-data.mjs            fetch from Livsmedelsverket, write both files
//   node scripts/nutrition-data.mjs --offline  rebuild the SQL from the committed JSON only
//
// Reads scripts/nutrition-mapping.mjs and, for each Livsmedelsverket food used,
// the values per 100 g from the open API (dataportal.livsmedelsverket.se,
// Livsmedelsdatabasen, CC BY 4.0). Writes:
//   scripts/nutrition-data/livsmedelsverket.json   the values used, with provenance
//   supabase/migrations/<stamp>_ingredient_nutrition.sql   the table and its seed
// The app never calls Livsmedelsverket: it reads the table.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAPPING } from "./nutrition-mapping.mjs";

const api = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1";
const jsonPath = fileURLToPath(new URL("./nutrition-data/livsmedelsverket.json", import.meta.url));
const migrationStamp = "20261108120000";
const sqlPath = fileURLToPath(new URL(`../supabase/migrations/${migrationStamp}_ingredient_nutrition.sql`, import.meta.url));
const offline = process.argv.includes("--offline");

const GROUPS = [
  "gronsak",
  "baljvaxt",
  "fisk",
  "rott_kott",
  "fagel",
  "agg",
  "mejeri",
  "fullkorn",
  "raffinerad",
  "fett",
  "socker",
  "ovrigt",
  "ej_raknad",
];

async function getJson(path) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${api}${path}`);
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
}

function value(rows, code, unit) {
  const row = rows.find((candidate) => candidate.euroFIRkod === code && (!unit || candidate.enhet === unit));
  return row ? Number(row.varde) : null;
}

async function fetchFoods(numbers) {
  const list = await getJson("/livsmedel?offset=0&limit=3000&sprak=1");
  const byNumber = new Map(list.livsmedel.map((food) => [food.nummer, food]));
  const foods = {};
  const queue = [...numbers];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (let number = queue.shift(); number !== undefined; number = queue.shift()) {
        const food = byNumber.get(number);
        if (!food) throw new Error(`Livsmedelsverket food ${number} does not exist`);
        const rows = await getJson(`/livsmedel/${number}/naringsvarden?sprak=1`);
        const entry = {
          name: food.namn,
          version: food.version,
          kcal: value(rows, "ENERC", "kcal"),
          protein_g: value(rows, "PROT"),
          fat_g: value(rows, "FAT"),
          carbs_g: value(rows, "CHO"),
          fiber_g: value(rows, "FIBT"),
        };
        for (const [key, amount] of Object.entries(entry)) {
          if (amount === null) throw new Error(`Food ${number} (${food.namn}) has no ${key}`);
        }
        foods[number] = entry;
      }
    }),
  );
  return Object.fromEntries(Object.entries(foods).sort(([a], [b]) => Number(a) - Number(b)));
}

const quote = (text) => `'${text.replaceAll("'", "''")}'`;
const num = (amount) => (amount === null ? "null" : String(amount));

function buildRows(foods) {
  const seen = new Map();
  const rows = [];
  for (const [names, lmv, group, perPiece, perDl] of MAPPING) {
    if (!GROUPS.includes(group)) throw new Error(`Unknown group ${group}`);
    if ((lmv === null) !== (group === "ej_raknad")) throw new Error(`${names[0]}: lmv null must mean ej_raknad`);
    const food = lmv === null ? null : foods[lmv];
    if (lmv !== null && !food) throw new Error(`${names[0]}: food ${lmv} missing from the data`);
    for (const name of names) {
      const key = name.normalize("NFC").trim().toLocaleLowerCase("sv-SE");
      if (seen.has(key)) throw new Error(`Duplicate ingredient name "${key}" (${seen.get(key)} and ${names[0]})`);
      seen.set(key, names[0]);
      rows.push({ name: key, lmv, food, group, perPiece, perDl });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "sv-SE"));
}

function buildSql(rows) {
  const values = rows.map(
    ({ name, lmv, food, group, perPiece, perDl }) =>
      `  (${quote(name)}, ${num(lmv)}, ${food ? quote(food.name) : "null"}, ${num(food?.kcal ?? null)}, ${num(food?.protein_g ?? null)}, ${num(food?.fat_g ?? null)}, ${num(food?.carbs_g ?? null)}, ${num(food?.fiber_g ?? null)}, ${num(perPiece)}, ${num(perDl)}, ${quote(group)})`,
  );
  return `-- Nutrition values per ingredient name (the nutrition feature; purely additive).
--
-- Source: Livsmedelsverket, Livsmedelsdatabasen (https://livsmedelsverket.se), provided
-- under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.sv).
-- The values were fetched once by scripts/nutrition-data.mjs and curated mapping in
-- scripts/nutrition-mapping.mjs; the app never calls Livsmedelsverket. Do not edit the
-- seed by hand: change the mapping and regenerate (tests/design/nutrition-checks.test.ts
-- checks that this file matches scripts/nutrition-data/livsmedelsverket.json).
--
-- Catalog ingredients belong to a household (ingredient.household_id), so there is no
-- shared ingredient id to point at. This is reference data keyed by the normalised
-- ingredient name (catalog.normalizeIngredientText), the same text the catalog matches on;
-- the app joins by name. Rows are read-only for clients (select to authenticated,
-- no insert, update or delete). The check list for kostrad_group must equal
-- KOSTRAD_GROUPS in src/features/nutrition/domain/groups.ts.
--
-- Revert: drop table public.ingredient_nutrition. Nothing else refers to it.

create table public.ingredient_nutrition (
  normalized_name text primary key,
  lmv_number integer,
  lmv_name text,
  kcal numeric(6, 1),
  protein_g numeric(5, 1),
  fat_g numeric(5, 1),
  carbs_g numeric(5, 1),
  fiber_g numeric(5, 1),
  grams_per_piece numeric(7, 1),
  grams_per_dl numeric(6, 1),
  kostrad_group text not null,
  constraint ingredient_nutrition_name_check check (normalized_name <> '' and normalized_name = lower(btrim(normalized_name))),
  constraint ingredient_nutrition_group_check check (
    kostrad_group in (${GROUPS.map(quote).join(", ")})
  ),
  constraint ingredient_nutrition_values_check check (
    (kostrad_group = 'ej_raknad') = (kcal is null)
    and (kcal is null) = (protein_g is null)
    and (kcal is null) = (fat_g is null)
    and (kcal is null) = (carbs_g is null)
    and (kcal is null) = (fiber_g is null)
    and (kostrad_group = 'ej_raknad') = (lmv_number is null)
  ),
  constraint ingredient_nutrition_amounts_check check (
    coalesce(kcal, 0) between 0 and 900
    and coalesce(protein_g, 0) between 0 and 100
    and coalesce(fat_g, 0) between 0 and 100
    and coalesce(carbs_g, 0) between 0 and 100
    and coalesce(fiber_g, 0) between 0 and 100
    and coalesce(grams_per_piece, 1) > 0
    and coalesce(grams_per_dl, 1) > 0
  )
);

alter table public.ingredient_nutrition enable row level security;

create policy ingredient_nutrition_read on public.ingredient_nutrition
  for select to authenticated
  using (true);

revoke all on table public.ingredient_nutrition from public, anon, authenticated, service_role;
grant select on table public.ingredient_nutrition to authenticated, service_role;

insert into public.ingredient_nutrition
  (normalized_name, lmv_number, lmv_name, kcal, protein_g, fat_g, carbs_g, fiber_g, grams_per_piece, grams_per_dl, kostrad_group)
values
${values.join(",\n")};
`;
}

const numbers = [...new Set(MAPPING.map((entry) => entry[1]).filter((lmv) => lmv !== null))];
let data;
if (offline) {
  if (!existsSync(jsonPath)) throw new Error("No committed JSON; run without --offline first");
  data = JSON.parse(readFileSync(jsonPath, "utf8"));
} else {
  data = {
    source: "Livsmedelsverket, Livsmedelsdatabasen",
    sourceUrl: "https://dataportal.livsmedelsverket.se/livsmedel",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/deed.sv",
    fetchedAt: new Date().toISOString().slice(0, 10),
    note: "Per 100 g edible part. kcal is the ENERC value in kcal.",
    foods: await fetchFoods(numbers),
  };
  mkdirSync(fileURLToPath(new URL("./nutrition-data/", import.meta.url)), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`);
}
const rows = buildRows(data.foods);
writeFileSync(sqlPath, buildSql(rows));
console.log(`${numbers.length} foods, ${rows.length} ingredient names (${rows.filter((row) => row.group === "ej_raknad").length} not counted)`);
