import { describe, expect, it } from "vitest";
import {
  TABLES,
  assertManifestCoversSchema,
  chunk,
  keyOf,
  needsSecondPass,
  orderTables,
  remapObjectPath,
  remapRow,
  sameServer,
  unrelatedKeys,
  type TableSpec,
} from "../../scripts/move-to-cloud/plan.ts";

const ids = { sourceUserId: "11111111-1111-4111-8111-111111111111", targetUserId: "22222222-2222-4222-8222-222222222222" };
const spec = (name: string) => TABLES.find((t) => t.name === name)!;

describe("orderTables", () => {
  it("puts every table after the tables it depends on", () => {
    const order = orderTables().map((t) => t.name);
    expect(new Set(order).size).toBe(TABLES.length);
    for (const t of TABLES) for (const dep of t.deps) expect(order.indexOf(dep)).toBeLessThan(order.indexOf(t.name));
  });

  it("rejects cycles and unknown dependencies", () => {
    const a: TableSpec = { name: "a", pk: ["id"], deps: ["b"] };
    const b: TableSpec = { name: "b", pk: ["id"], deps: ["a"] };
    expect(() => orderTables([a, b])).toThrow(/cycle/);
    expect(() => orderTables([{ ...a, deps: ["zzz"] }])).toThrow(/unknown/);
  });
});

describe("assertManifestCoversSchema", () => {
  it("accepts the exact set and names a missing or extra table", () => {
    const all = TABLES.map((t) => t.name);
    expect(() => assertManifestCoversSchema(all)).not.toThrow();
    expect(() => assertManifestCoversSchema([...all, "new_table"])).toThrow(/new_table/);
    expect(() => assertManifestCoversSchema(all.slice(1))).toThrow(/ingredient/);
  });
});

describe("remapRow", () => {
  it("rewrites user_id and keeps the primary key and every foreign key", () => {
    const row = { id: "r1", user_id: ids.sourceUserId, recipe_id: "x", amount: 1.5 };
    expect(remapRow(spec("recipe_ingredient"), row, ids)).toEqual({ ...row, user_id: ids.targetUserId });
    expect(row.user_id).toBe(ids.sourceUserId); // input untouched
  });

  it("never writes generated columns", () => {
    const row = { id: "o", user_id: ids.sourceUserId, label: "Pasta", label_key: "pasta" };
    expect(remapRow(spec("store_offer"), row, ids)).not.toHaveProperty("label_key");
  });

  it("refuses a row owned by someone else", () => {
    expect(() => remapRow(spec("recipe"), { id: "r", user_id: "other" }, ids)).toThrow(/källanvändaren/);
  });

  it("moves the user prefix of storage paths", () => {
    const row = { id: "p", user_id: ids.sourceUserId, object_path: `${ids.sourceUserId}/place/photo.jpg` };
    expect(remapRow(spec("thing_photo"), row, ids).object_path).toBe(`${ids.targetUserId}/place/photo.jpg`);
    expect(() => remapObjectPath("zzz/place/photo.jpg", ids.sourceUserId, ids.targetUserId)).toThrow();
  });

  it("nulls deferred keys in the first pass only, and flags rows for the second", () => {
    const row = { id: "t", user_id: ids.sourceUserId, same_as: "u" };
    expect(remapRow(spec("thing_item"), row, ids, { nullDeferred: true }).same_as).toBeNull();
    expect(remapRow(spec("thing_item"), row, ids).same_as).toBe("u");
    expect(needsSecondPass(spec("thing_item"), row)).toBe(true);
    expect(needsSecondPass(spec("thing_item"), { ...row, same_as: null })).toBe(false);
  });
});

describe("idempotency helpers", () => {
  it("gives the same key for the same row, so a second run upserts instead of adding", () => {
    const row = { id: "a", user_id: ids.sourceUserId };
    const moved = remapRow(spec("pantry_removal"), row, ids);
    expect(keyOf(spec("recipe"), row)).toBe(keyOf(spec("recipe"), moved));
    expect(keyOf(spec("pantry_removal"), moved)).toBe(`${ids.targetUserId}|a`);
  });

  it("finds target rows that are not part of the source", () => {
    expect(unrelatedKeys(new Set(["a", "b"]), ["a", "c", "b", "d"])).toEqual(["c", "d"]);
    expect(unrelatedKeys(new Set(["a"]), ["a"])).toEqual([]);
  });

  it("skips pending AI jobs only", () => {
    const skip = spec("ai_job").skip!;
    expect(skip.when({ status: "running" })).toBe(true);
    expect(skip.when({ status: "done" })).toBe(false);
  });

  it("splits into batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("sameServer", () => {
  it("treats localhost spellings and trailing slashes as the same server", () => {
    expect(sameServer("http://127.0.0.1:54321", "http://localhost:54321/")).toBe(true);
    expect(sameServer("http://127.0.0.1:54321", "http://127.0.0.1:56331")).toBe(false);
    expect(sameServer("https://abc.supabase.co", "https://ABC.supabase.co/")).toBe(true);
    expect(sameServer("http://127.0.0.1:54321", "https://abc.supabase.co")).toBe(false);
  });
});
