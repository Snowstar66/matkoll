import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { storeFormSchema } from "@/features/settings";
import { maxPackageSizeLength, maxProductNameLength, maxProductUrlLength, productChoiceFormSchema } from "@/features/shopping";
import { oneLine, refusedCodePoints } from "@/lib/one-line";

// AD-12, Story 7.2: the length limits in product_choice's checks are the same
// as productChoiceFormSchema's, and the characters the one-line checks of
// product_choice and store refuse are exactly refusedCodePoints
// (src/lib/one-line.ts), which the domain never stores. So the database and
// the domain never drift apart. Each constraint is read from the latest
// migration that (re)defines it; tests/integration covers the same set
// against the tables.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

/** The constraint's body in the latest migration that defines it, from `check (` to the matching `)`. */
function latestBody(name: string): { file: string; body: string } {
  const defining = readdirSync(migrations)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(migrations, file), "utf8") }))
    .filter(({ sql }) => sql.includes(`constraint ${name} check (`));
  const latest = defining.at(-1);
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

describe("product_choice constraints", () => {
  it.each([
    ["product_choice_product_name_check", "product_name", maxProductNameLength],
    ["product_choice_package_size_check", "package_size", maxPackageSizeLength],
    ["product_choice_url_check", "url", maxProductUrlLength],
  ])("limits %s to the domain's length", (constraint, column, max) => {
    const { file, body } = latestBody(constraint);
    const limit = new RegExp(`char_length\\(${column}\\) <= (\\d+)`).exec(body);
    expect(limit, `the limit in ${file}`).not.toBeNull();
    expect(Number(limit![1]), file).toBe(max);
  });
});

/** Every code point in refusedCodePoints. */
const refused = refusedCodePoints.flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i));
const char = (code: number) => String.fromCodePoint(code);
const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

/** The code points a `!~ '[...]'` bracket in a check lists, from its \xHH and \uHHHH escapes and ranges. */
function bracketCodePoints(body: string, column: string): number[] {
  const match = new RegExp(`${column} !~ '\\[(?:\\[:space:\\])?([^\\]]*)\\]'`).exec(body);
  if (!match) throw new Error(`No refused bracket for ${column}`);
  const tokens = [...match[1].matchAll(/\\x([0-9a-f]{2})|\\u([0-9a-f]{4})|(-)/gi)];
  const codes: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const [, x, u, dash] = tokens[index];
    if (dash) {
      const [, x2, u2] = tokens[index + 1];
      const end = Number.parseInt(x2 ?? u2, 16);
      for (let code = codes.at(-1)! + 1; code <= end; code += 1) codes.push(code);
      index += 1;
    } else {
      codes.push(Number.parseInt(x ?? u, 16));
    }
  }
  return codes;
}

describe("the refused characters", () => {
  it.each([
    ["product_choice_product_name_check", "product_name"],
    ["product_choice_package_size_check", "package_size"],
    ["product_choice_url_check", "url"],
    ["store_name_check", "name"],
    ["store_external_store_id_check", "external_store_id"],
    ["store_address_check", "address"],
    ["store_url_check", "url"],
  ])("are exactly refusedCodePoints in %s", (constraint, column) => {
    const { file, body } = latestBody(constraint);
    expect(bracketCodePoints(body, column).map(hex), file).toEqual(refused.map(hex));
  });

  it("are never left in a one-line text, nor in what the forms save", () => {
    for (const code of refused) {
      const text = `Arla${char(code)}grädde`;
      expect(oneLine(text), hex(code)).not.toContain(char(code));
      expect(oneLine(char(code)), hex(code)).toBe("");
      const choice = productChoiceFormSchema.parse({
        ingredientId: "11111111-1111-4111-8111-111111111111",
        storeId: "22222222-2222-4222-8222-222222222222",
        productName: text,
        packageSize: `5${char(code)}dl`,
        url: "",
        expected: null,
      });
      expect(choice.productName + (choice.packageSize ?? ""), hex(code)).not.toContain(char(code));
      const store = storeFormSchema.parse({
        id: "33333333-3333-4333-8333-333333333333",
        mode: "add",
        name: text,
        chain: "ICA",
        externalStoreId: `10${char(code)}03`,
        address: `Gatan${char(code)}1`,
        url: "",
        makeSelected: false,
      });
      expect(store.name + (store.externalStoreId ?? "") + (store.address ?? ""), hex(code)).not.toContain(char(code));
    }
  });

  const urls = [
    ...refused.map((code) => `https://www.arla.se/a${char(code)}b`),
    "arla.se/produkter",
    "http://www.arla.se/",
    "javascript:alert(1)",
    "data:text/html,x",
    "https://",
    "https:///produkter",
    "https://?q=1",
    "https://#x",
    "https://www.arla.se/a b",
    `https://www.arla.se/${"a".repeat(2048)}`,
  ];

  it("refuses every bad link in both forms", () => {
    for (const url of urls) {
      const choice = productChoiceFormSchema.safeParse({
        ingredientId: "11111111-1111-4111-8111-111111111111",
        storeId: "22222222-2222-4222-8222-222222222222",
        productName: "Arla",
        packageSize: "",
        url,
        expected: null,
      });
      expect(choice.success, JSON.stringify(url)).toBe(false);
      const store = storeFormSchema.safeParse({
        id: "33333333-3333-4333-8333-333333333333",
        mode: "add",
        name: "Maxi",
        chain: "ICA",
        externalStoreId: "",
        address: "",
        url,
        makeSelected: false,
      });
      expect(store.success, JSON.stringify(url)).toBe(false);
    }
  });
});
