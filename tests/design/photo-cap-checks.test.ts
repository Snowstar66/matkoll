import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { placePhotoBucket, placePhotoHouseholdCap } from "@/features/pantry/domain/place-photo";
import { thingPhotoBucket, thingPhotoHouseholdCap } from "@/features/things/domain/thing-photo";
import { errorMessages } from "@/lib/errors";

// The photo caps (S-10) are in the migration and in the domain: the two must
// say the same, and so must the messages. tests/integration/photo-caps.test.ts
// tries them against Storage.

const migrations = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const capsSql = () => {
  const [file] = readdirSync(migrations).filter((name) => /^\d+_photo_caps\.sql$/.test(name));
  return readFileSync(join(migrations, file!), "utf8");
};

describe("photo caps", () => {
  it("has the domain's caps in photo_household_cap", () => {
    const match = /select case bucket when '([^']+)' then (\d+) when '([^']+)' then (\d+) else 0 end;/.exec(capsSql());
    expect(match).not.toBeNull();
    const [, first, firstCap, second, secondCap] = match!;
    expect([first, Number(firstCap), second, Number(secondCap)]).toEqual([
      placePhotoBucket,
      placePhotoHouseholdCap,
      thingPhotoBucket,
      thingPhotoHouseholdCap,
    ]);
  });

  it("names each cap in its message", () => {
    expect(errorMessages.pantry_photo_cap).toContain(`${placePhotoHouseholdCap} `);
    expect(errorMessages.things_photo_cap).toContain(`${thingPhotoHouseholdCap} kort`);
  });
});
