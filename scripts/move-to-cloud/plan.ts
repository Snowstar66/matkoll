// Pure logic for `pnpm move:cloud` (Story 17.4): which tables are copied, in what
// order, how a row is rewritten for the new account, and the safety checks. No
// I/O here, so it is unit tested (plan.test.ts).

export type Row = Record<string, unknown>;

export type TableSpec = {
  name: string;
  /** Primary key columns; the upsert conflict target. */
  pk: string[];
  /** Tables that must be copied first (foreign keys). */
  deps: string[];
  /** Foreign keys to the same table or a later one: written as null first, then filled in by a second upsert. */
  deferred?: string[];
  /** Generated columns: read from the source but never written (the target computes them itself). */
  generated?: string[];
  /** Columns the target fills in itself on insert (a trigger), so they may differ from the source. */
  filledByTarget?: string[];
  /** Columns holding a storage object path whose first segment is the user id. */
  pathColumns?: string[];
  /** Rows to leave behind, with the reason (shown in the output). */
  skip?: { reason: string; when: (row: Row) => boolean };
};

// Every table in `public` has a `user_id` column and radskydd. The list is checked
// against the live schema at run time (assertManifestCoversSchema) so a new table
// can never be silently left behind.
export const TABLES: TableSpec[] = [
  { name: "ingredient", pk: ["id"], deps: [] },
  { name: "ingredient_synonym", pk: ["id"], deps: ["ingredient"] },
  { name: "recipe", pk: ["id"], deps: [] },
  { name: "recipe_step", pk: ["id"], deps: ["recipe"] },
  { name: "recipe_ingredient", pk: ["id"], deps: ["recipe", "recipe_step", "ingredient"] },
  { name: "recipe_site", pk: ["id"], deps: [] },
  { name: "pantry_site", pk: ["id"], deps: [] },
  { name: "pantry_item", pk: ["id"], deps: ["ingredient", "pantry_site"] },
  { name: "pantry_photo", pk: ["id"], deps: ["pantry_site"], pathColumns: ["object_path"] },
  { name: "pantry_removal", pk: ["user_id", "id"], deps: [] },
  { name: "pantry_addition", pk: ["id"], deps: [] },
  { name: "meal_plan", pk: ["id"], deps: [] },
  { name: "meal_plan_recipe", pk: ["id"], deps: ["meal_plan", "recipe"] },
  { name: "shopping_check", pk: ["id"], deps: ["meal_plan"] },
  { name: "shopping_custom_item", pk: ["id"], deps: ["meal_plan", "ingredient"] },
  { name: "shopping_line_override", pk: ["id"], deps: ["meal_plan"] },
  { name: "store", pk: ["id"], deps: [] },
  { name: "store_offer", pk: ["id"], deps: ["store", "ingredient"], generated: ["label_key"] },
  { name: "product_choice", pk: ["id"], deps: ["store", "ingredient"] },
  { name: "thing_place", pk: ["id"], deps: ["pantry_site"] },
  {
    name: "thing_photo",
    pk: ["id"],
    deps: ["thing_place"],
    deferred: ["replaces_photo_id"],
    pathColumns: ["object_path"],
  },
  { name: "thing_item", pk: ["id"], deps: ["thing_photo", "thing_place"], deferred: ["same_as"] },
  // Story 18.23: the history of a föremål's count; its foreign key is (item_id, user_id), so after thing_item.
  { name: "thing_change", pk: ["id"], deps: ["thing_item"] },
  {
    name: "ai_job",
    pk: ["id"],
    deps: [],
    // A job that was running when the data was read can never finish in the cloud, and
    // only one running job per user is allowed, so it would block the first real one.
    skip: { reason: "pågående AI-jobb", when: (row) => row.status === "running" },
  },
  { name: "ai_setting", pk: ["id"], deps: [] },
  { name: "ai_usage", pk: ["id"], deps: [] },
  // Only the sha256 hash is stored, so copying it never exposes a key and the same
  // key keeps working. `--skip-api-keys` leaves them out (then make a new key).
  { name: "api_key", pk: ["id"], deps: [] },
  // Story 20.3: what the user sent under Tyck till. The target's trigger fills in
  // sender_email from the cloud account; read_at is kept, so the inbox comes along as it was.
  { name: "feedback", pk: ["id"], deps: [], filledByTarget: ["sender_email"] },
  // Story 20.1: one row per user (unique user_id), so the user is the key: a cloud
  // account that has already closed the tour keeps one row.
  { name: "welcome_tour", pk: ["user_id"], deps: [] },
];

/**
 * Tables with a `user_id` that are never copied, with the reason. The live schema check
 * knows them, so they are not "unknown"; nothing is read from or written to them.
 */
export const EXCLUDED_TABLES: Record<string, string> = {
  // Story 20.3: who owns the app is not data of the account, and the cloud account has
  // another user id. Run `pnpm owner:sync` against the cloud after the move.
  app_owner: "ägaren sätts med pnpm owner:sync i molnet",
};

export const BUCKETS = ["pantry-photo", "thing-photo"];

/** Dependency order; throws on a cycle or an unknown dependency. Stable for ties. */
export function orderTables(tables: TableSpec[] = TABLES): TableSpec[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  for (const t of tables) {
    for (const dep of t.deps) if (!byName.has(dep)) throw new Error(`${t.name} depends on unknown table ${dep}`);
  }
  const done = new Set<string>();
  const visiting = new Set<string>();
  const out: TableSpec[] = [];
  const visit = (t: TableSpec) => {
    if (done.has(t.name)) return;
    if (visiting.has(t.name)) throw new Error(`dependency cycle at ${t.name}`);
    visiting.add(t.name);
    for (const dep of t.deps) visit(byName.get(dep)!);
    visiting.delete(t.name);
    done.add(t.name);
    out.push(t);
  };
  tables.forEach(visit);
  return out;
}

/** Throws if the live schema has a table with `user_id` that the manifest lacks (or the reverse). */
export function assertManifestCoversSchema(userTables: string[], tables: TableSpec[] = TABLES, excluded: Record<string, string> = EXCLUDED_TABLES): void {
  const known = new Set(tables.map((t) => t.name));
  const live = new Set(userTables.filter((t) => !(t in excluded)));
  const missing = [...live].filter((t) => !known.has(t));
  if (missing.length > 0) {
    throw new Error(`Tabeller med user_id som skriptet inte känner till: ${missing.join(", ")}. Uppdatera TABLES i scripts/move-to-cloud/plan.ts.`);
  }
  const gone = [...known].filter((t) => !live.has(t));
  if (gone.length > 0) throw new Error(`Skriptet listar tabeller som inte finns i databasen: ${gone.join(", ")}.`);
}

export function remapObjectPath(path: string, sourceUserId: string, targetUserId: string): string {
  const prefix = `${sourceUserId}/`;
  if (!path.startsWith(prefix)) throw new Error("objektsökväg utan källanvändarens id");
  return `${targetUserId}/${path.slice(prefix.length)}`;
}

/** The row as it is written to the target: new user_id, remapped storage paths, deferred keys nulled. */
export function remapRow(
  spec: TableSpec,
  row: Row,
  ids: { sourceUserId: string; targetUserId: string },
  options: { nullDeferred?: boolean } = {},
): Row {
  if (row.user_id !== ids.sourceUserId) throw new Error(`${spec.name}: raden tillhör inte källanvändaren`);
  const out: Row = { ...row, user_id: ids.targetUserId };
  for (const col of spec.pathColumns ?? []) {
    if (typeof out[col] === "string") out[col] = remapObjectPath(out[col], ids.sourceUserId, ids.targetUserId);
  }
  for (const col of spec.generated ?? []) delete out[col];
  if (options.nullDeferred) for (const col of spec.deferred ?? []) out[col] = null;
  return out;
}

/** The row without its generated columns, for comparing a written row with the source. */
export function stripGenerated(spec: TableSpec, row: Row): Row {
  const out = { ...row };
  for (const col of spec.generated ?? []) delete out[col];
  return out;
}

/** Rows for the second pass: only those where a deferred key is set. */
export function needsSecondPass(spec: TableSpec, row: Row): boolean {
  return (spec.deferred ?? []).some((col) => row[col] != null);
}

export function keyOf(spec: TableSpec, row: Row): string {
  return spec.pk.map((col) => String(row[col])).join("|");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Same server? Compares host (localhost = 127.0.0.1 = ::1) and port, ignoring path and trailing slash. */
export function sameServer(a: string, b: string): boolean {
  const norm = (value: string) => {
    const url = new URL(value);
    const host = ["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"].includes(url.hostname) ? "local" : url.hostname.toLowerCase();
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `${host}:${port}`;
  };
  return norm(a) === norm(b);
}

/** Target rows whose key is not among the source rows: data the move would be mixed with. */
export function unrelatedKeys(sourceKeys: Set<string>, targetKeys: string[]): string[] {
  return targetKeys.filter((key) => !sourceKeys.has(key));
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
