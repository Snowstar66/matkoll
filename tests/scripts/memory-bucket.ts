import { vi } from "vitest";

// A Storage bucket in memory for the scripts' tests (Story 10.3) that answers
// like Storage's list(): one folder at a time ("" is the bucket's root),
// folders without an id, and at most `limit` entries from `offset`. remove()
// answers with the objects it removed.

type Entry = { name: string; id: string | null };

/** A bucket in memory holding `paths`, with spies on list() and remove(). */
export function memoryBucket(paths: string[]) {
  const files = new Set(paths);
  const list = vi.fn(async (folder: string, { limit, offset }: { limit: number; offset: number }) => {
    const entries = new Map<string, Entry>();
    const prefix = folder === "" ? "" : `${folder}/`;
    for (const path of files) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...rest] = path.slice(prefix.length).split("/");
      entries.set(name, { name, id: rest.length > 0 ? null : `id-${path}` });
    }
    const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { data: sorted.slice(offset, offset + limit), error: null };
  });
  const remove = vi.fn(async (names: string[]) => {
    const gone = names.filter((name) => files.delete(name));
    return { data: gone.map((name) => ({ name })) as { name: string }[] | null, error: null as unknown };
  });
  return { bucket: { list, remove }, files, list, remove };
}
