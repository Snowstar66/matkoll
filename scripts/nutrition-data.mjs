// One-off generator for the nutrition data (run by hand, never at runtime, never in CI):
//
//   node scripts/nutrition-data.mjs            fetch the foods missing from the committed JSON, write both files
//   node scripts/nutrition-data.mjs --offline  rebuild the SQL from the committed JSON only
//
// Reads scripts/nutrition-mapping.mjs and, for each Livsmedelsverket food used,
// the values per 100 g from the open API (dataportal.livsmedelsverket.se,
// Livsmedelsdatabasen, CC BY 4.0). Writes:
//   scripts/nutrition-data/livsmedelsverket.json   the values used, with provenance
//   supabase/migrations/20261108120000_ingredient_nutrition.sql   the table and its first seed
//       (applied in the cloud: never rewritten here, only read)
//   supabase/migrations/20261108180000_ingredient_nutrition_additions.sql   its first additions
//       (applied in the cloud: never rewritten here, only read)
//   supabase/migrations/20261108220000_ingredient_nutrition_package_weights.sql   adds the column
//       grams_per_package and upserts every row that is new, different from the two migrations above,
//       or has a package weight (PACKAGE_GRAMS in the mapping)
// The app never calls Livsmedelsverket: it reads the table.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { MAPPING, PACKAGE_GRAMS } from "./nutrition-mapping.mjs";

const api = "https://dataportal.livsmedelsverket.se/livsmedel/api/v1";
const jsonPath = fileURLToPath(new URL("./nutrition-data/livsmedelsverket.json", import.meta.url));
const migrationStamp = "20261108120000";
const baseSqlPath = fileURLToPath(new URL(`../supabase/migrations/${migrationStamp}_ingredient_nutrition.sql`, import.meta.url));
const firstAdditionsPath = fileURLToPath(new URL("../supabase/migrations/20261108180000_ingredient_nutrition_additions.sql", import.meta.url));
const sqlPath = fileURLToPath(new URL("../supabase/migrations/20261108220000_ingredient_nutrition_package_weights.sql", import.meta.url));
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
  for (const [names, lmv, group, perPiece, perDl, perSlice = null] of MAPPING) {
    if (!GROUPS.includes(group)) throw new Error(`Unknown group ${group}`);
    if ((lmv === null) !== (group === "ej_raknad")) throw new Error(`${names[0]}: lmv null must mean ej_raknad`);
    const food = lmv === null ? null : foods[lmv];
    if (lmv !== null && !food) throw new Error(`${names[0]}: food ${lmv} missing from the data`);
    for (const name of names) {
      const key = name.normalize("NFC").trim().toLocaleLowerCase("sv-SE");
      if (seen.has(key)) throw new Error(`Duplicate ingredient name "${key}" (${seen.get(key)} and ${names[0]})`);
      seen.set(key, names[0]);
      rows.push({ name: key, lmv, food, group, perPiece, perDl, perSlice, perPackage: PACKAGE_GRAMS[key] ?? null });
    }
  }
  const names = new Set(rows.map((row) => row.name));
  for (const key of Object.keys(PACKAGE_GRAMS)) {
    if (!names.has(key)) throw new Error(`PACKAGE_GRAMS has "${key}", which is not a mapped name`);
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "sv-SE"));
}

/** A seed line as the two applied migrations wrote it (no package weight), to tell which rows are already in them. */
const valueLine = ({ name, lmv, food, group, perPiece, perDl, perSlice }) =>
      `  (${quote(name)}, ${num(lmv)}, ${food ? quote(food.name) : "null"}, ${num(food?.kcal ?? null)}, ${num(food?.protein_g ?? null)}, ${num(food?.fat_g ?? null)}, ${num(food?.carbs_g ?? null)}, ${num(food?.fiber_g ?? null)}, ${num(perPiece)}, ${num(perSlice)}, ${num(perDl)}, ${quote(group)})`;

/** The same row with its package weight, for the migration that adds the column. */
const packageLine = (row) => `${valueLine(row).slice(0, -1)}, ${num(row.perPackage)})`;

/** The package-weights migration: the column, and an upsert of every row that is not in the applied migrations as is, or has a package weight. */
function buildAdditionsSql(rows) {
  const base = new Set(
    [baseSqlPath, firstAdditionsPath].flatMap((path) => readFileSync(path, "utf8").split("\n").map((line) => line.replace(/[,;]$/, ""))),
  );
  const changed = rows.filter((row) => row.perPackage !== null || !base.has(valueLine(row)));
  if (changed.length === 0) return null;
  const values = changed.map(packageLine);
  return `-- Package weights and more nutrition rows (the nutrition feature; purely additive).
--
-- Adds ingredient_nutrition.grams_per_package (grams in one "förp", or one "kruka" or "knippe" of herbs;
-- null = not known, then the amount is not counted) and upserts every row that is new, differs from
-- 20261108120000 and 20261108180000, or has a package weight.
-- Generated by scripts/nutrition-data.mjs from scripts/nutrition-mapping.mjs (PACKAGE_GRAMS) and
-- scripts/nutrition-data/livsmedelsverket.json. Source: Livsmedelsverket, Livsmedelsdatabasen,
-- CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.sv). Do not edit by hand.
--
-- Revert: drop column public.ingredient_nutrition.grams_per_package, and delete the rows listed here
-- that 20261108120000 and 20261108180000 did not seed (nothing else refers to them).

alter table public.ingredient_nutrition add column grams_per_package numeric(7, 1);
alter table public.ingredient_nutrition
  add constraint ingredient_nutrition_package_check check (grams_per_package is null or grams_per_package > 0);

insert into public.ingredient_nutrition
  (normalized_name, lmv_number, lmv_name, kcal, protein_g, fat_g, carbs_g, fiber_g, grams_per_piece, grams_per_slice, grams_per_dl, kostrad_group, grams_per_package)
values
${values.join(",\n")}
on conflict (normalized_name) do update set
  lmv_number = excluded.lmv_number,
  lmv_name = excluded.lmv_name,
  kcal = excluded.kcal,
  protein_g = excluded.protein_g,
  fat_g = excluded.fat_g,
  carbs_g = excluded.carbs_g,
  fiber_g = excluded.fiber_g,
  grams_per_piece = excluded.grams_per_piece,
  grams_per_slice = excluded.grams_per_slice,
  grams_per_dl = excluded.grams_per_dl,
  kostrad_group = excluded.kostrad_group,
  grams_per_package = excluded.grams_per_package;
`;
}

const numbers = [...new Set(MAPPING.map((entry) => entry[1]).filter((lmv) => lmv !== null))];
if (!existsSync(jsonPath)) throw new Error("No committed JSON");
const data = JSON.parse(readFileSync(jsonPath, "utf8"));
if (!offline) {
  // Only the foods the committed JSON lacks are fetched, so values already in the cloud never shift.
  const missing = numbers.filter((number) => !data.foods[number]);
  if (missing.length > 0) {
    data.foods = Object.fromEntries(
      Object.entries({ ...data.foods, ...(await fetchFoods(missing)) }).sort(([a], [b]) => Number(a) - Number(b)),
    );
    data.fetchedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`);
  }
}
const rows = buildRows(data.foods);
const additions = buildAdditionsSql(rows);
if (additions) writeFileSync(sqlPath, additions);
console.log(`${numbers.length} foods, ${rows.length} ingredient names (${rows.filter((row) => row.group === "ej_raknad").length} not counted), additions written: ${additions !== null}`);
