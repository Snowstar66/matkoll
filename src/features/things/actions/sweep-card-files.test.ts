import { describe, expect, it, vi } from "vitest";
import { sweepCardFilesIn } from "./sweep-card-files";
import { removeCardFiles } from "../data/photos";
import type { ThingsDb } from "../data/client";

vi.mock("server-only", () => ({}));

// The sweep with a stand-in for the session client: which files it removes
// (only those without a row and old enough) and that a failure is a log line.

type Entry = { name: string; id: string | null; created_at?: string };

function fakeDb(options: { rows: string[]; tree: Record<string, Entry[]>; removeErrors?: number }) {
  const removed: string[][] = [];
  let failures = options.removeErrors ?? 0;
  const db = {
    from: () => ({ select: async () => ({ error: null, data: options.rows.map((object_path) => ({ object_path })) }) }),
    storage: {
      from: () => ({
        list: async (folder: string) => ({ error: null, data: options.tree[folder] ?? [] }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          if (failures > 0) {
            failures -= 1;
            return { error: { status: 500 } };
          }
          return { error: null };
        },
      }),
    },
  } as unknown as ThingsDb;
  return { db, removed };
}

const old = "2026-10-31T10:00:00Z";
const now = new Date("2026-10-31T12:00:00Z");

describe("sweepCardFilesIn", () => {
  it("removes old files without a row and leaves the others", async () => {
    const { db, removed } = fakeDb({
      rows: ["u/p/known.png"],
      tree: {
        u: [{ name: "p", id: null }],
        "u/p": [
          { name: "known.png", id: "1", created_at: old },
          { name: "orphan.png", id: "2", created_at: old },
          { name: "fresh.png", id: "3", created_at: "2026-10-31T11:59:00Z" },
        ],
      },
    });
    expect(await sweepCardFilesIn(db, "u", { now })).toBe(1);
    expect(removed).toEqual([["u/p/orphan.png"]]);
  });

  it("logs a reason, never a path, when the removal fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { db } = fakeDb({
      rows: [],
      tree: { u: [{ name: "p", id: null }], "u/p": [{ name: "orphan.png", id: "2", created_at: old }] },
      removeErrors: 2,
    });
    expect(await sweepCardFilesIn(db, "u", { now })).toBe(0);
    expect(log).toHaveBeenCalledWith("things_photo_remove_failed", { reason: "remove_failed 500" });
    log.mockRestore();
  });
});

describe("removeCardFiles", () => {
  it("tries once more when the first removal fails", async () => {
    const { db, removed } = fakeDb({ rows: [], tree: {}, removeErrors: 1 });
    expect(await removeCardFiles(db, ["u/p/a.png"])).toEqual({ failed: null });
    expect(removed).toHaveLength(2);
  });

  it("gives the failure when the second try fails too", async () => {
    const { db } = fakeDb({ rows: [], tree: {}, removeErrors: 2 });
    expect(await removeCardFiles(db, ["u/p/a.png"])).toEqual({ failed: "remove_failed 500" });
  });
});
