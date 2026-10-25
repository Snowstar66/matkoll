import { normalizeUnit } from "@/features/catalog";
import type { AiRecipe } from "@/server/ai/schemas";

// Compares a parseRecipe answer with <name>.expected.json. Used by `pnpm eval:ai`
// and by the mock's tests, which prove that each fixture answer meets its own
// expectations.

export type ExpectedIngredient = {
  /** Catalog name; several mean "any of these". Matched as whole words, not substrings. */
  name: string | string[];
  amount: number | null;
  unit: string | null;
};

export type Expected = {
  title: string;
  servings: number;
  /** Checked when present; null means the recipe states no time. */
  totalMinutes?: number | null;
  ingredientCount: number;
  keyIngredients: ExpectedIngredient[];
  /** originalText of lines that must be vague; every line with that text must be. */
  vagueLines: string[];
};

export type Check = { name: string; ok: boolean; expected: string; actual: string };

export const normalize = (value: string) =>
  value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** True when every word of `wanted` appears as a whole word in `name` ("lök" matches "gul lök", not "vitlök"). */
export function nameMatches(name: string, wanted: string): boolean {
  const words = normalize(name).split(" ");
  const wantedWords = normalize(wanted).split(" ");
  for (let start = 0; start + wantedWords.length <= words.length; start++) {
    if (wantedWords.every((word, index) => words[start + index] === word)) return true;
  }
  return false;
}

const show = (value: unknown) => (value === null || value === undefined ? "–" : String(value));

export function compare(recipe: AiRecipe, expected: Expected): Check[] {
  const checks: Check[] = [
    {
      name: "Titel",
      ok: normalize(recipe.title) === normalize(expected.title),
      expected: expected.title,
      actual: recipe.title,
    },
    {
      name: "Portioner",
      ok: recipe.servings === expected.servings,
      expected: String(expected.servings),
      actual: String(recipe.servings),
    },
    {
      name: "Antal rader",
      ok: recipe.ingredients.length === expected.ingredientCount,
      expected: String(expected.ingredientCount),
      actual: String(recipe.ingredients.length),
    },
  ];
  if (expected.totalMinutes !== undefined) {
    checks.push({
      name: "Tid (min)",
      ok: recipe.totalMinutes === expected.totalMinutes,
      expected: show(expected.totalMinutes),
      actual: show(recipe.totalMinutes),
    });
  }
  for (const key of expected.keyIngredients) {
    const names = Array.isArray(key.name) ? key.name : [key.name];
    const line = recipe.ingredients.find((candidate) => names.some((name) => nameMatches(candidate.hint.name, name)));
    const unitOk = Boolean(line) && sameUnit(line?.unit ?? null, key.unit);
    checks.push({
      name: `Ingrediens "${names[0]}"`,
      ok: Boolean(line) && line?.amount === key.amount && unitOk,
      expected: `${show(key.amount)} ${show(key.unit)}`,
      actual: line ? `${line.hint.name}: ${show(line.amount)} ${show(line.unit)}` : "saknas",
    });
  }
  for (const vague of expected.vagueLines) {
    const lines = recipe.ingredients.filter((candidate) => normalize(candidate.originalText) === normalize(vague));
    checks.push({
      name: `Vag rad "${vague}"`,
      ok: lines.length > 0 && lines.every((line) => line.isVague && line.amount === null && line.unit === null),
      expected: "isVague, utan mängd och enhet",
      actual:
        lines.length === 0
          ? "raden saknas"
          : lines.map((line) => `isVague=${line.isVague}, mängd=${show(line.amount)}, enhet=${show(line.unit)}`).join("; "),
    });
  }
  return checks;
}

/**
 * Units compared the way the catalog stores them (normalizeUnit: "burk" and
 * "förp" are the same), and a plain count equals "st" ("2 ägg" vs "2 st ägg").
 */
function sameUnit(actual: string | null, expected: string | null): boolean {
  const canonical = (unit: string | null) => {
    if (unit === null) return "st";
    const { unit: normalized } = normalizeUnit(unit);
    return normalized ?? unit.trim().toLocaleLowerCase("sv-SE");
  };
  return canonical(actual) === canonical(expected);
}
