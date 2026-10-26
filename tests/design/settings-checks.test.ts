import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { maxExternalStoreIdLength, maxStoreAddressLength, maxStoreNameLength, maxStoreUrlLength, STORE_CHAINS } from "@/features/settings";

// AD-12, Story 7.1: a store's chain is one of STORE_CHAINS. The list in
// store_chain_check must be exactly STORE_CHAINS, in the same order, and the
// length limits the same as storeFormSchema's, so the database and the domain
// never drift apart. Each constraint is read from the latest migration that
// (re)defines it.

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

describe("store constraints", () => {
  it("lists exactly STORE_CHAINS in store_chain_check", () => {
    const { file, body } = latestBody("store_chain_check");
    const list = /chain in \(([^)]*)\)/.exec(body);
    expect(list, `the chain list in ${file}`).not.toBeNull();
    expect([...list![1].matchAll(/'([^']*)'/g)].map((value) => value[1]), file).toEqual([...STORE_CHAINS]);
  });

  it.each([
    ["store_name_check", "name", maxStoreNameLength],
    ["store_external_store_id_check", "external_store_id", maxExternalStoreIdLength],
    ["store_address_check", "address", maxStoreAddressLength],
    ["store_url_check", "url", maxStoreUrlLength],
  ])("limits %s to the domain's length", (constraint, column, max) => {
    const { file, body } = latestBody(constraint);
    const limit = new RegExp(`char_length\\(${column}\\) <= (\\d+)`).exec(body);
    expect(limit, `the limit in ${file}`).not.toBeNull();
    expect(Number(limit![1]), file).toBe(max);
  });
});

// AD-21, Story 7.1: every user who existed before the store table gets the
// default store, selected, unless the user has a store already. The migration
// runs without a session, so it sets user_id from auth.users.
describe("store backfill", () => {
  it("inserts the default store, selected, for every user without a store", () => {
    const files = readdirSync(migrations).filter((name) => /^\d+_settings_store\.sql$/.test(name));
    expect(files, "supabase/migrations/<time>_settings_store.sql").toHaveLength(1);
    const sql = readFileSync(join(migrations, files[0]), "utf8");
    const backfill = /insert into public\.store \(([^)]*)\)\s*select ([^\n]*)\s*from auth\.users as users\s*where not exists \(select 1 from public\.store as own where own\.user_id = users\.id\)/.exec(
      sql,
    );
    expect(backfill, `the backfill in ${files[0]}`).not.toBeNull();
    const columns = backfill![1].split(",").map((column) => column.trim());
    const values = backfill![2].split(/,(?=(?:[^']*'[^']*')*[^']*$)/).map((value) => value.trim());
    expect(Object.fromEntries(columns.map((column, index) => [column, values[index]]))).toEqual({
      user_id: "users.id",
      name: "'Maxi ICA Stormarknad Östersund'",
      chain: "'ICA'",
      external_store_id: "'1003733'",
      url: "'https://handlaprivatkund.ica.se/stores/1003733'",
      is_selected: "true",
    });
  });
});
