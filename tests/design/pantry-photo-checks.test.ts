import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCATIONS } from "@/features/catalog";
import { maxPointCoordinate, maxReadingItems, maxReadingLabelChars } from "@/features/pantry/domain/photo-numbers";
import { placePhotoBucket, placePhotoFolder, placePhotoMediaTypes } from "@/features/pantry/domain/place-photo";
import { imageSideTolerance, maxImageBytes, maxPlacePhotoSide } from "@/lib/images";

// Story 10.1 (AD-26): the literals in the photo migration are the domain's
// values, so the bucket, the table's checks and the code never drift apart:
// the bucket's id, size limit and types, the locations and their folders in
// the path check, the media types, the largest side and the reading's length.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));

function migration(suffix: string): string {
  const files = readdirSync(migrations).filter((name) => new RegExp(`^\\d+_${suffix}\\.sql$`).test(name));
  if (files.length !== 1) throw new Error(`Expected one <time>_${suffix}.sql, found ${files.length}`);
  return readFileSync(join(migrations, files[0]), "utf8");
}

const photoSql = () => migration("pantry_photo");
const hardeningSql = () => migration("pantry_photo_hardening");

const quoted = (list: string) => [...list.matchAll(/'([^']*)'/g)].map((match) => match[1]);

describe("the photo migration", () => {
  it("sets the private bucket's id, size limit and types again in the hardening, even when it exists", () => {
    const sql = hardeningSql();
    const match = /values \('([^']+)', '([^']+)', false, (\d+), array\[([^\]]*)\]\)\s+on conflict \(id\) do update\s+set public = false,\s+file_size_limit = (\d+),\s+allowed_mime_types = array\[([^\]]*)\];/.exec(sql);
    expect(match).not.toBeNull();
    const [, id, name, limit, types, updatedLimit, updatedTypes] = match!;
    expect([id, name]).toEqual([placePhotoBucket, placePhotoBucket]);
    expect([Number(limit), Number(updatedLimit)]).toEqual([maxImageBytes, maxImageBytes]);
    expect(quoted(types)).toEqual([...placePhotoMediaTypes]);
    expect(quoted(updatedTypes)).toEqual([...placePhotoMediaTypes]);
  });

  it("takes uploads only at a photo's path: the user's id, a place, a location's folder, an id and .jpg or .png", () => {
    const pattern = /name ~ '([^']+)'/.exec(hardeningSql())![1];
    const path = new RegExp(pattern);
    const id = "22222222-2222-4222-8222-222222222222";
    for (const location of LOCATIONS) expect(path.test(`${id}/${id}/${placePhotoFolder(location)}/${id}.jpg`)).toBe(true);
    for (const bad of [`${id}/x.png`, `${id}/${id}/kyl/x.png`, `${id}/${id}/kyl/${id}.gif`, `${id}/${id}/kallare/${id}.png`, `${id}/${id}/kyl/${id}.png/x`]) {
      expect(path.test(bad), bad).toBe(false);
    }
  });

  it("creates the private bucket with the domain's id, size limit and types", () => {
    const match = /values \('([^']+)', '([^']+)', (false|true), (\d+), '\{([^}]*)\}'\)/.exec(photoSql());
    expect(match).not.toBeNull();
    const [, id, name, isPublic, limit, types] = match!;
    expect(id).toBe(placePhotoBucket);
    expect(name).toBe(placePhotoBucket);
    expect(isPublic).toBe("false");
    expect(Number(limit)).toBe(maxImageBytes);
    expect(types.split(",")).toEqual([...placePhotoMediaTypes]);
  });

  // The bucket's first policies. Story 21.2a (20261102130000_household.sql) replaces them with the
  // household's rule, tried against real files in tests/integration/household-isolation.test.ts.
  it("gives every policy the bucket and the user's own folder, for select, insert and delete only", () => {
    const sql = photoSql();
    const policies = [...sql.matchAll(/create policy (\w+) on storage\.objects\s+for (\w+) to (\w+)\s+(using|with check) \(([^;]+)\);/g)];
    expect(policies.map((policy) => [policy[1], policy[2], policy[3]])).toEqual([
      ["pantry_photo_select", "select", "authenticated"],
      ["pantry_photo_insert", "insert", "authenticated"],
      ["pantry_photo_delete", "delete", "authenticated"],
    ]);
    for (const policy of policies) {
      expect(policy[5]).toBe(
        `bucket_id = '${placePhotoBucket}' and (storage.foldername(name))[1] = (select auth.uid())::text`,
      );
    }
    expect(sql).not.toMatch(/on storage\.objects\s+for (update|all)/);
    expect(sql).not.toMatch(/to anon/);
  });

  it("checks the locations and media types of the domain", () => {
    const sql = photoSql();
    expect(quoted(/pantry_photo_location_check check \(location in \(([^)]*)\)\)/.exec(sql)![1])).toEqual([...LOCATIONS]);
    expect(quoted(/pantry_photo_media_type_check check \(media_type in \(([^)]*)\)\)/.exec(sql)![1])).toEqual([
      ...placePhotoMediaTypes,
    ]);
  });

  it("names each location's folder in the path check as placePhotoFolder does", () => {
    const folders = /case location ((?:when '[^']+' then '[^']+' )+)end/.exec(photoSql())![1];
    const pairs = [...folders.matchAll(/when '([^']+)' then '([^']+)'/g)].map((match) => [match[1], match[2]]);
    expect(pairs).toEqual(LOCATIONS.map((location) => [location, placePhotoFolder(location)]));
  });

  it("allows the largest side of the domain", () => {
    const sql = photoSql();
    const side = maxPlacePhotoSide + imageSideTolerance;
    expect(sql).toContain(`width between 1 and ${side} and height between 1 and ${side}`);
  });

  it("checks the reading and the points with the domain's limits in the hardening", () => {
    const sql = hardeningSql();
    expect(sql).toContain(`when jsonb_array_length(reading) > ${maxReadingItems} then false`);
    expect(sql).toContain(`char_length(element.value #>> '{}') not between 1 and ${maxReadingLabelChars}`);
    expect(sql).toContain(`when jsonb_array_length(points) > ${maxReadingItems} then false`);
    expect(sql).toContain(`not between 1 and least(${maxReadingItems}, jsonb_array_length(reading))`);
    expect(sql).toContain(`(point.value ->> 'x')::numeric not between 0 and ${maxPointCoordinate}`);
    expect(sql).toContain(`(point.value ->> 'y')::numeric not between 0 and ${maxPointCoordinate}`);
    expect(sql).toContain("add constraint pantry_photo_reading_check check (public.pantry_photo_reading_valid(reading))");
    expect(sql).toContain("check (public.pantry_photo_points_valid(points, reading))");
  });
});
