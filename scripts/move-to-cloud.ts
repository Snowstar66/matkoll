#!/usr/bin/env node
// Story 17.4: moves one user's data (database rows and storage files) from one
// Supabase project to another, normally the local one to the cloud. Run it with
// `pnpm move:cloud` (Node 24 runs the TypeScript directly). Guide: docs/molnet.md,
// "Flytta din data". The pure logic is in scripts/move-to-cloud/plan.ts.
//
//   pnpm move:cloud --dry-run     print what would be copied, change nothing
//   pnpm move:cloud               copy (safe to run again: rows are upserted on their keys)
//   --force                       go ahead although the target user already has other data
//   --skip-api-keys               leave the Siri/quick-add keys behind (make a new key instead)
//
// Settings come from the environment or a prompt, never from a file in git:
//   MOVE_SOURCE_URL, MOVE_SOURCE_SERVICE_KEY   (default: the local stack, read with `supabase status`)
//   MOVE_SOURCE_EMAIL                          the user to copy
//   MOVE_TARGET_URL, MOVE_TARGET_SERVICE_KEY   the cloud project's URL and secret key
//   MOVE_TARGET_USER                           the new account's id or e-mail
// The service keys are read hidden and never printed. The source is only read.

import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  BUCKETS,
  TABLES,
  UUID,
  assertManifestCoversSchema,
  chunk,
  keyOf,
  needsSecondPass,
  orderTables,
  remapObjectPath,
  remapRow,
  sameServer,
  unrelatedKeys,
  type Row,
  type TableSpec,
} from "./move-to-cloud/plan.ts";

const PAGE = 1000;
const BATCH = 200;

type Flags = { dryRun: boolean; force: boolean; skipApiKeys: boolean };
type Settings = { sourceUrl: string; sourceKey: string; sourceEmail: string; targetUrl: string; targetKey: string; targetUser: string };
type FileInfo = { path: string; size: number | null; contentType: string | null };

class Refusal extends Error {}

function parseFlags(argv: string[]): Flags {
  const known = new Set(["--dry-run", "--force", "--skip-api-keys", "--help"]);
  for (const arg of argv) if (!known.has(arg)) throw new Refusal(`Okänd flagga ${arg}. Giltiga: ${[...known].join(", ")}`);
  if (argv.includes("--help")) {
    console.log("pnpm move:cloud [--dry-run] [--force] [--skip-api-keys]  (se docs/molnet.md, Flytta din data)");
    process.exit(0);
  }
  return { dryRun: argv.includes("--dry-run"), force: argv.includes("--force"), skipApiKeys: argv.includes("--skip-api-keys") };
}

async function ask(question: string, secret = false): Promise<string> {
  if (!process.stdin.isTTY) throw new Refusal(`${question} saknas: sätt miljövariabeln (inget terminalläge för frågor).`);
  process.stdout.write(`${question}: `);
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (chunkText: string) => {
      for (const ch of chunkText) {
        if (ch === "\u0003") process.exit(130);
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value.trim());
          return;
        }
        if (ch === "\u007f") {
          if (value.length > 0 && !secret) process.stdout.write("\b \b");
          value = value.slice(0, -1);
        } else {
          value += ch;
          if (!secret) process.stdout.write(ch);
        }
      }
    };
    process.stdin.on("data", onData);
  });
}

function localStatus(): Record<string, string> {
  try {
    const out = execFileSync("supabase", ["status", "-o", "env"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return Object.fromEntries(
      out
        .split("\n")
        .map((line) => line.match(/^([A-Z0-9_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );
  } catch {
    return {};
  }
}

async function readSettings(): Promise<Settings> {
  const env = process.env;
  let sourceUrl = env.MOVE_SOURCE_URL ?? "";
  let sourceKey = env.MOVE_SOURCE_SERVICE_KEY ?? "";
  if (!sourceUrl || !sourceKey) {
    const local = localStatus();
    sourceUrl ||= local.API_URL ?? "";
    sourceKey ||= local.SERVICE_ROLE_KEY ?? local.SECRET_KEY ?? "";
  }
  sourceUrl ||= await ask("Källans URL (lokala Supabase, t.ex. http://127.0.0.1:54321)");
  sourceKey ||= await ask("Källans service-nyckel (visas inte)", true);
  const sourceEmail = env.MOVE_SOURCE_EMAIL || (await ask("Källanvändarens e-post"));
  const targetUrl = env.MOVE_TARGET_URL || (await ask("Målets URL (https://<ref>.supabase.co)"));
  const targetKey = env.MOVE_TARGET_SERVICE_KEY || (await ask("Målets service-nyckel/secret key (visas inte)", true));
  const targetUser = env.MOVE_TARGET_USER || (await ask("Målanvändarens id eller e-post"));
  for (const [label, value] of [["källans URL", sourceUrl], ["målets URL", targetUrl]] as const) {
    try {
      new URL(value);
    } catch {
      throw new Refusal(`Ogiltig ${label}.`);
    }
  }
  if (!sourceKey || !targetKey || !sourceEmail || !targetUser) throw new Refusal("Något värde saknas.");
  return { sourceUrl, sourceKey, sourceEmail, targetUrl, targetKey, targetUser };
}

const client = (url: string, key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function fail(step: string, error: { message: string } | null): never {
  throw new Error(`${step}: ${error?.message ?? "okänt fel"}`);
}

async function findUserId(db: SupabaseClient, who: string, label: string): Promise<string> {
  if (UUID.test(who)) {
    const { data, error } = await db.auth.admin.getUserById(who);
    if (error || !data.user) throw new Refusal(`${label}: ingen användare med id ${who}.`);
    return data.user.id;
  }
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`${label}: användarlistan`, error);
    const hit = data.users.find((u) => u.email?.toLowerCase() === who.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) break;
  }
  throw new Refusal(`${label}: ingen användare med e-post ${who}.`);
}

/** Tables with a `user_id` column, from PostgREST's OpenAPI description (service key only). */
async function userTablesOf(url: string, key: string, label: string): Promise<string[]> {
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${label}: kunde inte läsa schemat (HTTP ${res.status})`);
  const spec = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
  return Object.entries(spec.definitions ?? {})
    .filter(([, def]) => def.properties && "user_id" in def.properties)
    .map(([name]) => name)
    .sort();
}

async function readRows(db: SupabaseClient, spec: TableSpec, userId: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(spec.name).select("*").eq("user_id", userId);
    for (const col of spec.pk) query = query.order(col);
    const { data, error } = await query.range(from, from + PAGE - 1);
    if (error) fail(`läsa ${spec.name}`, error);
    rows.push(...(data as Row[]));
    if (data.length < PAGE) return rows;
  }
}

async function countRows(db: SupabaseClient, name: string, userId: string): Promise<number> {
  const { count, error } = await db.from(name).select("*", { count: "exact", head: true }).eq("user_id", userId);
  if (error) fail(`räkna ${name}`, error);
  return count ?? 0;
}

async function listBucketNames(db: SupabaseClient): Promise<string[]> {
  const { data, error } = await db.storage.listBuckets();
  if (error) fail("lista buckets", error);
  return data.map((b) => b.name).sort();
}

/** Every file below `<userId>/` in the bucket, with its path relative to the bucket root. */
async function listUserFiles(db: SupabaseClient, bucket: string, userId: string): Promise<FileInfo[]> {
  const files: FileInfo[] = [];
  const walk = async (folder: string, depth: number) => {
    if (depth > 6) throw new Error(`${bucket}: för djup mappstruktur`);
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await db.storage.from(bucket).list(folder, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) fail(`lista ${bucket}`, error);
      for (const entry of data) {
        const path = `${folder}/${entry.name}`;
        if (entry.id === null) await walk(path, depth + 1);
        else {
          const meta = (entry.metadata ?? {}) as { size?: number; mimetype?: string };
          files.push({ path, size: meta.size ?? null, contentType: meta.mimetype ?? null });
        }
      }
      if (data.length < 100) return;
    }
  };
  await walk(userId, 0);
  return files;
}

type FileState = { bucket: string; source: FileInfo[]; target: FileInfo[] };

async function readFileStates(src: SupabaseClient, dst: SupabaseClient, srcUser: string, dstUser: string): Promise<FileState[]> {
  const targetBuckets = new Set(await listBucketNames(dst));
  const names = [...new Set([...BUCKETS, ...(await listBucketNames(src))])].sort();
  const states: FileState[] = [];
  const sourceBuckets = new Set(await listBucketNames(src));
  for (const bucket of names) {
    const source = sourceBuckets.has(bucket) ? await listUserFiles(src, bucket, srcUser) : [];
    const target = targetBuckets.has(bucket) ? await listUserFiles(dst, bucket, dstUser) : [];
    if (source.length > 0 || target.length > 0 || BUCKETS.includes(bucket)) states.push({ bucket, source, target });
  }
  return states;
}

async function ensureBucket(src: SupabaseClient, dst: SupabaseClient, bucket: string): Promise<void> {
  const { data: existing } = await dst.storage.getBucket(bucket);
  if (existing) return;
  const { data: from, error } = await src.storage.getBucket(bucket);
  if (error || !from) fail(`läsa bucketen ${bucket}`, error);
  const { error: createError } = await dst.storage.createBucket(bucket, {
    public: from.public,
    fileSizeLimit: from.file_size_limit ?? undefined,
    allowedMimeTypes: from.allowed_mime_types ?? undefined,
  });
  if (createError) fail(`skapa bucketen ${bucket}`, createError);
}

async function copyFiles(src: SupabaseClient, dst: SupabaseClient, state: FileState, ids: { sourceUserId: string; targetUserId: string }) {
  const have = new Map(state.target.map((f) => [f.path, f.size]));
  let copied = 0;
  let same = 0;
  for (const file of state.source) {
    const to = remapObjectPath(file.path, ids.sourceUserId, ids.targetUserId);
    if (have.has(to) && have.get(to) === file.size && file.size !== null) {
      same += 1;
      continue;
    }
    const { data, error } = await src.storage.from(state.bucket).download(file.path);
    if (error || !data) fail(`hämta fil ur ${state.bucket}`, error);
    const { error: upError } = await dst.storage.from(state.bucket).upload(to, data, { upsert: true, contentType: file.contentType ?? undefined });
    if (upError) fail(`lägga upp fil i ${state.bucket}`, upError);
    copied += 1;
  }
  return { copied, same };
}

const pad = (value: string | number, width: number) => String(value).padStart(width);

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const settings = await readSettings();

  if (sameServer(settings.sourceUrl, settings.targetUrl)) {
    throw new Refusal("Källan och målet är samma server. Avbryter: det här skriptet flyttar mellan två olika projekt.");
  }
  const src = client(settings.sourceUrl, settings.sourceKey);
  const dst = client(settings.targetUrl, settings.targetKey);

  const sourceUserId = await findUserId(src, settings.sourceEmail, "källan");
  const targetUserId = await findUserId(dst, settings.targetUser, "målet");
  const ids = { sourceUserId, targetUserId };
  console.log(`Läge: ${flags.dryRun ? "TORRKÖRNING (inget ändras)" : "KOPIERA"}${flags.force ? ", --force" : ""}${flags.skipApiKeys ? ", utan API-nycklar" : ""}`);
  console.log(`Källa: ${new URL(settings.sourceUrl).host}, användare ${sourceUserId}`);
  console.log(`Mål:   ${new URL(settings.targetUrl).host}, användare ${targetUserId}`);

  // The table list must match both databases exactly.
  const tables = orderTables(TABLES).filter((t) => !(flags.skipApiKeys && t.name === "api_key"));
  assertManifestCoversSchema(await userTablesOf(settings.sourceUrl, settings.sourceKey, "källan"));
  assertManifestCoversSchema(await userTablesOf(settings.targetUrl, settings.targetKey, "målet"));

  // Read everything from the source (only reads).
  const sourceRows = new Map<string, Row[]>();
  const moved = new Map<string, Row[]>();
  for (const spec of tables) {
    const rows = await readRows(src, spec, sourceUserId);
    sourceRows.set(spec.name, rows);
    moved.set(spec.name, spec.skip ? rows.filter((r) => !spec.skip!.when(r)) : rows);
  }
  const files = await readFileStates(src, dst, sourceUserId, targetUserId);

  const before = new Map<string, { target: number; add: number }>();
  const unrelated: string[] = [];
  for (const spec of tables) {
    const targetRows = await readRows(dst, spec, targetUserId);
    const sourceKeys = new Set(moved.get(spec.name)!.map((r) => keyOf(spec, remapRow(spec, r, ids))));
    const targetKeys = new Set(targetRows.map((r) => keyOf(spec, r)));
    before.set(spec.name, { target: targetRows.length, add: [...sourceKeys].filter((k) => !targetKeys.has(k)).length });
    const extra = unrelatedKeys(sourceKeys, targetRows.map((r) => keyOf(spec, r)));
    if (extra.length > 0) unrelated.push(`${spec.name} (${extra.length})`);
    // A primary key already used by another user in the target must never be overwritten.
    if (spec.pk.length === 1 && spec.pk[0] === "id") {
      for (const part of chunk(moved.get(spec.name)!.map((r) => String(r.id)), 100)) {
        const { data, error } = await dst.from(spec.name).select("id").in("id", part).neq("user_id", targetUserId);
        if (error) fail(`kontrollera ${spec.name}`, error);
        if (data.length > 0) throw new Refusal(`${spec.name}: ${data.length} rader med samma id finns hos en annan användare i målet. Avbryter.`);
      }
    }
  }
  for (const state of files) {
    const expected = new Set(state.source.map((f) => remapObjectPath(f.path, sourceUserId, targetUserId)));
    const extra = unrelatedKeys(expected, state.target.map((f) => f.path));
    if (extra.length > 0) unrelated.push(`filer i ${state.bucket} (${extra.length})`);
  }
  if (unrelated.length > 0) {
    const message = `Målanvändaren har redan annan data: ${unrelated.join(", ")}.`;
    if (!flags.force) throw new Refusal(`${message} Avbryter. Skapa kontot nytt och töm det, eller kör med --force om du vet vad du gör.`);
    console.log(`VARNING: ${message} Fortsätter på grund av --force.`);
  }

  if (!flags.dryRun) {
    for (const spec of tables) {
      const rows = moved.get(spec.name)!;
      const onConflict = spec.pk.join(",");
      for (const part of chunk(rows, BATCH)) {
        const payload = part.map((r) => remapRow(spec, r, ids, { nullDeferred: true }));
        const { error } = await dst.from(spec.name).upsert(payload, { onConflict });
        if (error) fail(`skriva ${spec.name}`, error);
      }
      const later = rows.filter((r) => needsSecondPass(spec, r));
      for (const part of chunk(later, BATCH)) {
        const payload = part.map((r) => remapRow(spec, r, ids));
        const { error } = await dst.from(spec.name).upsert(payload, { onConflict });
        if (error) fail(`skriva ${spec.name} (andra varvet)`, error);
      }
      console.log(`  ${spec.name}: ${rows.length} rader`);
    }
    for (const state of files) {
      if (state.source.length === 0) continue;
      await ensureBucket(src, dst, state.bucket);
      const result = await copyFiles(src, dst, state, ids);
      console.log(`  filer ${state.bucket}: ${result.copied} kopierade, ${result.same} fanns redan`);
    }
  }

  // Count again on both sides and compare.
  console.log("\nRader per tabell");
  console.log(`${"tabell".padEnd(24)}${pad("källa före", 11)}${pad("källa efter", 12)}${pad("mål före", 9)}${pad("mål efter", 10)}${pad("ska bli", 8)}`);
  let wrong = 0;
  for (const spec of tables) {
    const sourceBefore = sourceRows.get(spec.name)!.length;
    const sourceAfter = await countRows(src, spec.name, sourceUserId);
    const targetBefore = before.get(spec.name)!.target;
    const targetAfter = await countRows(dst, spec.name, targetUserId);
    const skipped = sourceBefore - moved.get(spec.name)!.length;
    const add = before.get(spec.name)!.add;
    const shouldBe = targetBefore + add;
    const ok = sourceAfter === sourceBefore && (flags.dryRun ? targetAfter === targetBefore : targetAfter === shouldBe);
    if (!ok) wrong += 1;
    console.log(
      `${spec.name.padEnd(24)}${pad(sourceBefore, 11)}${pad(sourceAfter, 12)}${pad(targetBefore, 9)}${pad(targetAfter, 10)}${pad(flags.dryRun ? `+${add}` : shouldBe, 8)}${skipped > 0 ? `  (${skipped} utelämnade: ${spec.skip!.reason})` : ""}${ok ? "" : "  <-- STÄMMER INTE"}`,
    );
  }
  console.log("\nFiler per bucket");
  console.log(`${"bucket".padEnd(24)}${pad("källa", 8)}${pad("mål före", 10)}${pad("mål efter", 11)}`);
  for (const state of files) {
    const after = flags.dryRun ? state.target.length : (await listUserFiles(dst, state.bucket, targetUserId)).length;
    const ok = flags.dryRun ? after === state.target.length : after >= state.source.length;
    if (!ok) wrong += 1;
    console.log(`${state.bucket.padEnd(24)}${pad(state.source.length, 8)}${pad(state.target.length, 10)}${pad(after, 11)}${ok ? "" : "  <-- STÄMMER INTE"}`);
  }
  if (flags.dryRun) console.log("\nTorrkörning: ingenting ändrades. Kör utan --dry-run för att kopiera.");
  else if (wrong > 0) throw new Error(`${wrong} rader i översikten stämmer inte.`);
  else console.log("\nKlart. Alla antal stämmer.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "okänt fel";
  console.error(error instanceof Refusal ? `Avbröt: ${message}` : `Fel: ${message}`);
  process.exit(error instanceof Refusal ? 2 : 1);
});
