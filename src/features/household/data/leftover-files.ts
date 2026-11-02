import "server-only";
import { placePhotoBucket } from "@/features/pantry";
import { thingPhotoBucket } from "@/features/things";
import type { HouseholdDb } from "./household";

// The photo files a member leaves behind when they go (Story 21.2b; the 21.2a
// review's note, docs/molnet.md "Kvar till 21.2b och 21.3"). A file lies in
// the folder of the member who took it, `<user>/<place>/…`. The rows of the
// household keep their files readable after the member has gone; a file with
// no row (a card being saved, a card removed while "Ångra" was still open)
// would be read by no one, so it is removed while the member is still in the
// household, before they leave or are removed. Never throws: a file that is
// left anyway is one the household can still remove (the bucket's policy
// lets it reach any file under its own places), and nothing else can read it.

const listPage = 100;
/** The most folders one walk lists, so it never runs away. */
const maxFolders = 500;

async function listFiles(db: HouseholdDb, bucket: string, folder: string, depth: number, budget: { folders: number }): Promise<string[]> {
  if (budget.folders <= 0) return [];
  budget.folders -= 1;
  const files: string[] = [];
  for (let offset = 0; ; offset += listPage) {
    const { data, error } = await db.storage.from(bucket).list(folder, { limit: listPage, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) return files;
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id !== null && entry.id !== undefined) files.push(path);
      else if (depth > 0) files.push(...(await listFiles(db, bucket, path, depth - 1, budget)));
    }
    if (data.length < listPage) return files;
  }
}

/** The files without a row in `member`'s folder under the household's places, in both buckets. */
export async function loadLeftoverFilesIn(db: HouseholdDb, member: string): Promise<{ bucket: string; paths: string[] }[]> {
  const [sites, places, pantryRows, thingRows] = await Promise.all([
    db.from("pantry_site").select("id"),
    db.from("thing_place").select("id"),
    db.from("pantry_photo").select("object_path").like("object_path", `${member}/%`),
    db.from("thing_photo").select("object_path").like("object_path", `${member}/%`),
  ]);
  if (sites.error || places.error || pantryRows.error || thingRows.error) return [];
  const budget = { folders: maxFolders };
  const pantryKnown = new Set(pantryRows.data.map((row) => row.object_path));
  const thingKnown = new Set(thingRows.data.map((row) => row.object_path));
  const pantryFiles: string[] = [];
  // A pantry photo is at <user>/<site>/<location>/<file>.
  for (const site of sites.data) pantryFiles.push(...(await listFiles(db, placePhotoBucket, `${member}/${site.id}`, 2, budget)));
  const thingFiles: string[] = [];
  // A card is at <user>/<place>/<file>.
  for (const place of places.data) thingFiles.push(...(await listFiles(db, thingPhotoBucket, `${member}/${place.id}`, 0, budget)));
  return [
    { bucket: placePhotoBucket, paths: pantryFiles.filter((path) => !pantryKnown.has(path)) },
    { bucket: thingPhotoBucket, paths: thingFiles.filter((path) => !thingKnown.has(path)) },
  ];
}

/** Removes `member`'s files without a row under the household's places; gives back how many went. */
export async function removeLeftoverFilesIn(db: HouseholdDb, member: string): Promise<number> {
  let removed = 0;
  try {
    for (const { bucket, paths } of await loadLeftoverFilesIn(db, member)) {
      for (let start = 0; start < paths.length; start += listPage) {
        const batch = paths.slice(start, start + listPage);
        const { data, error } = await db.storage.from(bucket).remove(batch);
        if (error) console.error("household_leftover_files_failed", { reason: `remove ${error.name}` });
        else removed += data?.length ?? 0;
      }
    }
  } catch {
    console.error("household_leftover_files_failed", { reason: "threw" });
  }
  return removed;
}
