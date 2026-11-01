// Run by scripts/test-move-to-cloud.sh against two throwaway local stacks.
// Seeds a fixture user in the source, runs the real CLI (dry run, refusals, move,
// second move), then checks counts, deep equality, files and RLS in the target.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TABLES, keyOf, remapObjectPath, remapRow, stripGenerated, type Row } from "./plan.ts";

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} saknas`);
  return value;
};
const src = { url: env("SRC_URL"), key: env("SRC_KEY"), anon: env("SRC_ANON"), container: "supabase_db_matkoll-move-src" };
const dst = { url: env("DST_URL"), key: env("DST_KEY"), anon: env("DST_ANON"), container: "supabase_db_matkoll-move-dst" };
// Throwaway users of a throwaway stack; a fresh password per run.
const PASSWORD = `pw-${createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 20)}`;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = (s: typeof src) => createClient(s.url, s.key, opts);

function psql(s: typeof src, sql: string, vars: Record<string, string> = {}) {
  const args = ["exec", "-i", s.container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`])];
  const res = spawnSync("docker", args, { input: sql, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`psql: ${res.stderr.slice(0, 600)}`);
}

async function makeUser(db: SupabaseClient, email: string) {
  const { data, error } = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

const bytes = (seed: string, n = 2048) => {
  const out = Buffer.alloc(n);
  createHash("sha256").update(seed).digest().copy(out);
  for (let i = 32; i < n; i += 1) out[i] = (out[i - 32] * 31 + i) & 255;
  return out;
};
const sha = (data: Buffer | ArrayBuffer) => createHash("sha256").update(Buffer.from(data as ArrayBuffer)).digest("hex");

function runCli(args: string[], extra: Record<string, string> = {}) {
  const res = spawnSync("node", ["scripts/move-to-cloud.ts", ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      MOVE_SOURCE_URL: src.url,
      MOVE_SOURCE_SERVICE_KEY: src.key,
      MOVE_SOURCE_EMAIL: "pontus@fixture.test",
      MOVE_TARGET_URL: dst.url,
      MOVE_TARGET_SERVICE_KEY: dst.key,
      MOVE_TARGET_USER: "cloud@fixture.test",
      ...extra,
    },
  });
  const output = `${res.stdout}${res.stderr}`;
  for (const secret of [src.key, dst.key]) assert.ok(!output.includes(secret), "a service key leaked into the output");
  return { status: res.status, output };
}

async function allRows(db: SupabaseClient, table: string, userId: string): Promise<Row[]> {
  const { data, error } = await db.from(table).select("*").eq("user_id", userId).limit(10000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data as Row[];
}

async function filesUnder(db: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100 });
  if (error) throw new Error(error.message);
  for (const e of data) {
    if (e.id === null) out.push(...(await filesUnder(db, bucket, `${folder}/${e.name}`)));
    else out.push(`${folder}/${e.name}`);
  }
  return out;
}

const check = (name: string) => console.log(`  ok  ${name}`);

async function main() {
  const S = admin(src);
  const D = admin(dst);
  const fixture = readFileSync(new URL("./fixture.sql", import.meta.url), "utf8");

  console.log("== seeding");
  const pontus = await makeUser(S, "pontus@fixture.test");
  const annan = await makeUser(S, "annan@fixture.test");
  const cloud = await makeUser(D, "cloud@fixture.test");
  const granne = await makeUser(D, "granne@fixture.test");
  const full = await makeUser(D, "full@fixture.test");
  psql(src, fixture, { uid: pontus });
  // Another user in the source (must stay behind) and in the target (must see nothing).
  const other = (uid: string, tag: string, name = "Mjölk", key = "mjolk") => `
    insert into public.ingredient (id, user_id, name, normalized_name, section, location) values ('${tag}000000-0000-4000-8000-000000000001', '${uid}', '${name}', '${key}', 'Mejeri', 'Kyl');
    insert into public.recipe (id, user_id, title, original_servings, source_kind) values ('${tag}000000-0000-4000-8000-000000000002', '${uid}', 'Grannens recept', 2, 'text');`;
  psql(src, other(annan, "c1"));
  psql(dst, other(granne, "c2"));
  psql(dst, other(full, "c3", "Smör", "smor"));

  const pantryPath = `${pontus}/a7000000-0000-4000-8000-000000000001/kyl/a9000000-0000-4000-8000-000000000001.png`;
  const thingPaths = [
    `${pontus}/b4000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000001.jpg`,
    `${pontus}/b4000000-0000-4000-8000-000000000001/b5000000-0000-4000-8000-000000000002.jpg`,
  ];
  const sourceFiles: [string, string][] = [["pantry-photo", pantryPath], ...thingPaths.map((p): [string, string] => ["thing-photo", p])];
  for (const [bucket, path] of sourceFiles) {
    const { error } = await S.storage.from(bucket).upload(path, bytes(path), { contentType: path.endsWith(".png") ? "image/png" : "image/jpeg" });
    assert.equal(error, null, `upload ${path}`);
  }
  const { error: otherFile } = await S.storage.from("thing-photo").upload(`${annan}/x/y.jpg`, bytes("other"), { contentType: "image/jpeg" });
  assert.equal(otherFile, null);

  const sourceRows = new Map<string, Row[]>();
  for (const t of TABLES) sourceRows.set(t.name, await allRows(S, t.name, pontus));
  const total = [...sourceRows.values()].reduce((n, r) => n + r.length, 0);
  assert.ok(total >= 40, `fixture too small: ${total}`);
  for (const t of TABLES) assert.ok(sourceRows.get(t.name)!.length > 0, `fixture has no ${t.name} rows`);
  console.log(`   fixture: ${total} rows in ${TABLES.length} tables, ${sourceFiles.length} files`);

  console.log("== dry run");
  const dry = runCli(["--dry-run"]);
  assert.equal(dry.status, 0, dry.output);
  assert.match(dry.output, /TORRKÖRNING/);
  for (const t of TABLES) assert.equal((await allRows(D, t.name, cloud)).length, 0, `dry run wrote to ${t.name}`);
  assert.equal((await filesUnder(D, "thing-photo", cloud)).length, 0);
  check("dry run prints counts and changes nothing");

  console.log("== refusals");
  const same = runCli([], { MOVE_TARGET_URL: src.url, MOVE_TARGET_SERVICE_KEY: src.key, MOVE_TARGET_USER: "annan@fixture.test" });
  assert.equal(same.status, 2, same.output);
  assert.match(same.output, /samma server/);
  const unrelated = runCli([], { MOVE_TARGET_USER: "full@fixture.test" });
  assert.equal(unrelated.status, 2, unrelated.output);
  assert.match(unrelated.output, /redan annan data/);
  assert.equal((await allRows(D, "recipe", full)).length, 1);
  const missing = runCli([], { MOVE_TARGET_USER: "ingen@fixture.test" });
  assert.equal(missing.status, 2, missing.output);
  check("same server and a target with other data are refused, nothing written");

  console.log("== move");
  const first = runCli([]);
  assert.equal(first.status, 0, first.output);
  assert.match(first.output, /Klart\. Alla antal stämmer/);
  console.log(first.output.split("\n").filter((l) => /^(tabell|bucket|[a-z_]+ +\d)/.test(l)).join("\n"));

  const ids = { sourceUserId: pontus, targetUserId: cloud };
  const expectedByTable = new Map<string, Row[]>();
  for (const t of TABLES) {
    const rows = sourceRows.get(t.name)!.filter((r) => !(t.skip && t.skip.when(r)));
    expectedByTable.set(t.name, rows);
    const got = await allRows(D, t.name, cloud);
    assert.equal(got.length, rows.length, `${t.name}: count`);
    const byKey = new Map(got.map((r) => [keyOf(t, r), r]));
    for (const row of rows) {
      const want = remapRow(t, row, ids);
      const have = byKey.get(keyOf(t, want))!;
      assert.deepStrictEqual(stripGenerated(t, have), want, `${t.name}: row differs`);
      for (const col of t.generated ?? []) assert.equal(have[col], row[col], `${t.name}.${col}: generated value differs`);
    }
  }
  check("every table: same count, rows deep-equal apart from user_id and storage paths");
  const jobs = await allRows(D, "ai_job", cloud);
  assert.ok(jobs.every((j) => j.status !== "running"));
  check("running AI job left behind");
  const fk = await allRows(D, "thing_item", cloud);
  assert.equal(fk.find((r) => r.id === "b6000000-0000-4000-8000-000000000002")?.same_as, "b6000000-0000-4000-8000-000000000001");
  check("self-referencing keys (same_as, replaces_photo_id) restored");
  const hashRow = (await allRows(D, "api_key", cloud))[0];
  assert.match(String(hashRow.key_hash), /^[0-9a-f]{64}$/);
  assert.equal(hashRow.key_hash, (sourceRows.get("api_key")![0] as Row).key_hash);
  check("api key hash copied");

  for (const [bucket, path] of sourceFiles) {
    const to = remapObjectPath(path, pontus, cloud);
    const { data, error } = await D.storage.from(bucket).download(to);
    assert.equal(error, null, `download ${to}`);
    assert.equal(sha(await data!.arrayBuffer()), sha(bytes(path)), `${to}: bytes differ`);
  }
  assert.equal((await filesUnder(D, "thing-photo", cloud)).length, 2);
  assert.equal((await filesUnder(D, "pantry-photo", cloud)).length, 1);
  // DB paths point at files that exist in the target.
  for (const row of await allRows(D, "thing_photo", cloud)) {
    assert.equal((await D.storage.from("thing-photo").download(String(row.object_path))).error, null);
  }
  check("files copied byte for byte under the new user id; database paths resolve");

  console.log("== second run (idempotent)");
  const again = runCli([]);
  assert.equal(again.status, 0, again.output);
  assert.match(again.output, /Klart/);
  assert.match(again.output, /thing-photo: 0 kopierade, 2 fanns redan/);
  for (const t of TABLES) assert.equal((await allRows(D, t.name, cloud)).length, expectedByTable.get(t.name)!.length, `${t.name}: duplicates`);
  assert.equal((await filesUnder(D, "thing-photo", cloud)).length, 2);
  check("no duplicates in rows or files");

  console.log("== source untouched");
  for (const t of TABLES) assert.equal((await allRows(S, t.name, pontus)).length, sourceRows.get(t.name)!.length);
  assert.equal((await allRows(S, "recipe", annan)).length, 1);
  check("source counts unchanged");

  console.log("== RLS in the target");
  const as = async (email: string) => {
    const c = createClient(dst.url, dst.anon, opts);
    const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(error, null, `sign in ${email}`);
    return c;
  };
  const mine = await as("cloud@fixture.test");
  const neighbour = await as("granne@fixture.test");
  let rlsChecked = 0;
  for (const t of TABLES) {
    const expected = expectedByTable.get(t.name)!.length;
    if (t.name === "api_key" || t.name === "ai_job") continue; // not readable or only through RPC for users; checked below if granted
    const a = await mine.from(t.name).select("id", { count: "exact", head: true });
    if (a.error) continue;
    assert.equal(a.count, expected, `${t.name}: new user should see all ${expected}`);
    const b = await neighbour.from(t.name).select("id", { count: "exact", head: true });
    const own = t.name === "recipe" || t.name === "ingredient" ? 1 : 0;
    assert.equal(b.count, own, `${t.name}: another user sees ${b.count}`);
    rlsChecked += 1;
  }
  assert.ok(rlsChecked >= 22, `only ${rlsChecked} tables were readable for the RLS check`);
  const visible = await mine.from("thing_photo").select("object_path");
  assert.equal(visible.data?.length, 2);
  const okFile = await mine.storage.from("thing-photo").download(String(visible.data![0].object_path));
  assert.equal(okFile.error, null);
  const noFile = await neighbour.storage.from("thing-photo").download(String(visible.data![0].object_path));
  assert.ok(noFile.error, "another user must not read the photo");
  check("new user reads all rows and files; another user reads none of them");

  console.log("== --force");
  const clash = runCli(["--force"], { MOVE_TARGET_USER: "full@fixture.test" });
  assert.equal(clash.status, 2, clash.output);
  assert.match(clash.output, /annan användare i målet/);
  assert.equal((await allRows(D, "recipe", full)).length, 1);
  const forced = runCli(["--force"], { MOVE_SOURCE_EMAIL: "annan@fixture.test", MOVE_TARGET_USER: "full@fixture.test" });
  assert.equal(forced.status, 0, forced.output);
  assert.match(forced.output, /VARNING/);
  assert.equal((await allRows(D, "recipe", full)).length, 2);
  check("ids owned by another target user are never overwritten; --force adds to a target with its own rows");

  console.log("== --skip-api-keys");
  psql(dst, `delete from public.api_key where user_id = '${cloud}'`);
  const noKeys = runCli(["--skip-api-keys"]);
  assert.equal(noKeys.status, 0, noKeys.output);
  assert.equal((await allRows(D, "api_key", cloud)).length, 0);
  check("api keys left out on request");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
