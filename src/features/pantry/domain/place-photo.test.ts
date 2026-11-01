import { describe, expect, it } from "vitest";
import {
  clampTakenAt,
  latestPhotoOpenLabel,
  latestPhotoOpenText,
  latestPhotoText,
  maxTakenAtAgeMs,
  photoReadingHeading,
  photoTakenText,
  photoTimeText,
  placePhotoCutoff,
  placePhotoFolder,
  placePhotoMaxAgeMs,
  placePhotoPath,
  placePhotoPointsSchema,
  placePhotoRowSchema,
  placePhotoUrl,
  readPlacePhotoForm,
  removedPhotoText,
  removePhotoQuestion,
  removePhotoText,
  removePlacePhotoSchema,
  savedPhotoAlt,
  savedPhotoMarkers,
  storedPoints,
  toPlacePhoto,
} from "./place-photo";

// Senaste foto (Story 10.1, AD-26): the photo's path, the time it was taken
// and the fields that come with it to POST /api/pantry/photo.

const user = "11111111-1111-4111-8111-111111111111";
const site = "22222222-2222-4222-8222-222222222222";
const photo = "33333333-3333-4333-8333-333333333333";

const fields = (overrides: Partial<Record<"site" | "location" | "takenAt" | "reading" | "points", string | null>> = {}) => ({
  site,
  location: "Kyl",
  takenAt: "2026-10-26T15:42:00.000Z",
  reading: JSON.stringify(["Mellanmjölk 1,5 %", "Smör 500 g"]),
  points: null,
  ...overrides,
});

describe("placePhotoPath", () => {
  it("is the user's folder, the place, the location's folder and the photo's id with its extension", () => {
    expect(placePhotoPath(user, site, "Kyl", photo, "image/jpeg")).toBe(`${user}/${site}/kyl/${photo}.jpg`);
    expect(placePhotoPath(user, site, "Skafferi", photo, "image/png")).toBe(`${user}/${site}/skafferi/${photo}.png`);
  });

  it.each([
    ["Kyl", "kyl"],
    ["Frys", "frys"],
    ["Skafferi", "skafferi"],
  ] as const)("names %s's folder %s", (location, folder) => {
    expect(placePhotoFolder(location)).toBe(folder);
  });
});

describe("clampTakenAt", () => {
  const now = new Date("2026-10-26T16:00:00.000Z");

  it("keeps a time within the last day", () => {
    const taken = new Date("2026-10-26T15:42:00.000Z");
    expect(clampTakenAt(taken, now)).toEqual(taken);
    expect(clampTakenAt(new Date(now.getTime() - maxTakenAtAgeMs), now)).toEqual(new Date(now.getTime() - maxTakenAtAgeMs));
  });

  it.each([
    ["an hour from now", new Date("2026-10-26T17:00:00.000Z")],
    ["more than a day ago", new Date(now.getTime() - maxTakenAtAgeMs - 1)],
    ["no time at all", new Date(Number.NaN)],
  ])("gives the server's time for %s", (_name, taken) => {
    expect(clampTakenAt(taken, now)).toEqual(now);
  });
});

describe("readPlacePhotoForm", () => {
  it("reads the place, the location, the time, the reading and no points", () => {
    const form = readPlacePhotoForm(fields());
    expect(form.success).toBe(true);
    expect(form.data).toEqual({
      site,
      location: "Kyl",
      takenAt: new Date("2026-10-26T15:42:00.000Z"),
      reading: ["Mellanmjölk 1,5 %", "Smör 500 g"],
    });
  });

  it("reads the points, each for an item of the reading", () => {
    const points = { positions: [{ n: 1, x: 120, y: 400 }, { n: 2, x: 0, y: 1000 }] };
    const form = readPlacePhotoForm(fields({ points: JSON.stringify(points) }));
    expect(form.data?.points).toEqual(points);
  });

  it("takes an empty reading, and a time with an offset", () => {
    expect(readPlacePhotoForm(fields({ reading: "[]", takenAt: "2026-10-26T17:42:00+02:00" })).success).toBe(true);
  });

  it.each([
    ["a place that is not a uuid", { site: "Stugan" }],
    ["no place", { site: null }],
    ["a location outside Kyl, Frys and Skafferi", { location: "Källare" }],
    ["a location in lower case", { location: "kyl" }],
    ["no time", { takenAt: null }],
    ["a time that is not one", { takenAt: "idag 15:42" }],
    ["a reading that is not JSON", { reading: "Mjölk, Smör" }],
    ["no reading", { reading: null }],
    ["26 labels", { reading: JSON.stringify(Array.from({ length: 26 }, (_, index) => `Vara ${index}`)) }],
    ["a label with a line break", { reading: JSON.stringify(["Mjölk\nSmör"]) }],
    ["points that are not JSON", { points: "1,2" }],
    ["a point outside 0–1000", { points: JSON.stringify({ positions: [{ n: 1, x: 1200, y: 40 }] }) }],
    ["a point for item 3 of 2", { points: JSON.stringify({ positions: [{ n: 3, x: 10, y: 40 }] }) }],
    ["two points for one item", { points: JSON.stringify({ positions: [{ n: 1, x: 10, y: 40 }, { n: 1, x: 20, y: 40 }] }) }],
    ["points without positions", { points: JSON.stringify([{ n: 1, x: 10, y: 40 }]) }],
    ["a reading field over 16 KB", { reading: JSON.stringify(["x".repeat(16 * 1024)]) }],
    ["a points field over 16 KB", { points: `${" ".repeat(16 * 1024)}{}` }],
  ])("refuses %s", (_name, overrides) => {
    expect(readPlacePhotoForm(fields(overrides)).success).toBe(false);
  });
});

describe("placePhotoPointsSchema", () => {
  it("takes the saved photo's id and its points", () => {
    expect(placePhotoPointsSchema.safeParse({ id: photo, points: { positions: [{ n: 1, x: 1, y: 2 }] } }).success).toBe(true);
  });

  it.each([
    ["an id that is not a uuid", { id: "photo", points: { positions: [] } }],
    ["a point outside 0–1000", { id: photo, points: { positions: [{ n: 1, x: -1, y: 2 }] } }],
    ["item 26", { id: photo, points: { positions: [{ n: 26, x: 1, y: 2 }] } }],
    ["two points for one item", { id: photo, points: { positions: [{ n: 1, x: 1, y: 2 }, { n: 1, x: 3, y: 4 }] } }],
  ])("refuses %s", (_name, input) => {
    expect(placePhotoPointsSchema.safeParse(input).success).toBe(false);
  });
});

describe("storedPoints", () => {
  it("keeps the points, and gives null for none", () => {
    expect(storedPoints({ positions: [{ n: 1, x: 1, y: 2 }] })).toEqual([{ n: 1, x: 1, y: 2 }]);
    expect(storedPoints({ positions: [] })).toBeNull();
    expect(storedPoints(undefined)).toBeNull();
  });
});

// Visa senaste fotot (Story 10.2, UX-DR21, UX-DR22): the texts of the line
// and the sheet, the time in Swedish time, the markers from the saved points
// and the rows as Matvaror reads them.

describe("photoTimeText", () => {
  const now = new Date("2026-10-26T16:00:00+01:00");

  it("says idag, igår or the day and month, with the time in Stockholm", () => {
    expect(photoTimeText(new Date("2026-10-26T15:42:00+01:00"), now)).toBe("idag 15:42");
    expect(photoTimeText(new Date("2026-10-25T09:10:00+01:00"), now)).toBe("igår 09:10");
    expect(photoTimeText(new Date("2026-10-24T15:42:00+02:00"), now)).toBe("24 okt 15:42");
    expect(photoTimeText(new Date("2026-09-30T07:05:00+02:00"), now)).toBe("30 sep 07:05");
  });

  it("counts the day in Stockholm, not in UTC", () => {
    // 23:30 UTC on the 25th is 00:30 on the 26th in Stockholm.
    expect(photoTimeText(new Date("2026-10-25T23:30:00Z"), now)).toBe("idag 00:30");
    // Just after midnight in Stockholm, the evening before is igår.
    expect(photoTimeText(new Date("2026-10-25T22:59:00+01:00"), new Date("2026-10-26T00:01:00+01:00"))).toBe("igår 22:59");
    // Summer time.
    expect(photoTimeText(new Date("2026-07-01T10:00:00Z"), new Date("2026-07-01T20:00:00Z"))).toBe("idag 12:00");
  });

  it("says idag for a photo taken after now, on a later day too (a clock that runs fast)", () => {
    expect(photoTimeText(new Date("2026-10-26T16:05:00+01:00"), now)).toBe("idag 16:05");
    expect(photoTimeText(new Date("2026-10-27T00:10:00+01:00"), now)).toBe("idag 00:10");
  });

  it("writes midnight as 00 and every month the same way everywhere", () => {
    expect(photoTimeText(new Date("2026-03-03T00:00:00+01:00"), now)).toBe("3 mars 00:00");
    expect(photoTimeText(new Date("2026-06-15T12:00:00+02:00"), now)).toBe("15 juni 12:00");
  });
});

describe("the texts of the line and the sheet", () => {
  it("has the line, its button's name and the subtitle with and without points", () => {
    expect(latestPhotoText("idag 15:42")).toBe("Senaste idag 15:42");
    expect(latestPhotoText("24 okt 15:42")).toBe("Senaste 24 okt 15:42");
    expect(latestPhotoOpenText).toBe("Visa");
    expect(latestPhotoOpenLabel("Frys")).toBe("Visa senaste foto av frysen");
    expect(photoTakenText("idag 15:42", true)).toBe("Taget idag 15:42. Numren visar vad AI:n läste av.");
    expect(photoTakenText("idag 15:42", false)).toBe("Taget idag 15:42.");
    expect(photoReadingHeading).toBe("AI:n läste av:");
    expect(savedPhotoAlt("Kyl")).toBe("Senaste fotot av kylen");
  });

  it("asks before removing and confirms after", () => {
    expect(removePhotoText).toBe("Ta bort fotot");
    expect(removePhotoQuestion("Kyl")).toBe("Ta bort fotot av kylen?");
    expect(removedPhotoText("Frys")).toBe("Tog bort fotot av frysen.");
  });

  it("has the route's address for a photo", () => {
    expect(placePhotoUrl(photo)).toBe(`/api/pantry/photo/${photo}`);
  });
});

describe("savedPhotoMarkers", () => {
  const reading = ["Mjölk", "Smör", "vara", "Ägg"];

  it("gives a marker per point with its number, in percent, in number order", () => {
    expect(
      savedPhotoMarkers(
        [
          { n: 4, x: 900, y: 50 },
          { n: 1, x: 125, y: 500 },
        ],
        reading,
      ),
    ).toEqual([
      { key: 1, label: 1, left: 12.5, top: 50 },
      { key: 4, label: 4, left: 90, top: 5 },
    ]);
  });

  it("has none without points, and none for a number beyond the reading, a placeholder or a second point", () => {
    expect(savedPhotoMarkers(null, reading)).toEqual([]);
    expect(
      savedPhotoMarkers(
        [
          { n: 5, x: 1, y: 1 },
          { n: 3, x: 1, y: 1 },
          { n: 2, x: 10, y: 10 },
          { n: 2, x: 20, y: 20 },
        ],
        reading,
      ),
    ).toEqual([{ key: 2, label: 2, left: 1, top: 1 }]);
  });

  it("gives 18 markers for 20 items with 18 points", () => {
    const twenty = Array.from({ length: 20 }, (_, index) => `Vara ${index + 1}`);
    const points = Array.from({ length: 18 }, (_, index) => ({ n: index + 1, x: index * 10, y: index * 20 }));
    expect(savedPhotoMarkers(points, twenty)).toHaveLength(18);
  });
});

describe("placePhotoRowSchema", () => {
  const row = {
    id: photo,
    location: "Kyl",
    taken_at: "2026-10-26T14:42:00+00:00",
    width: 720,
    height: 900,
    reading: ["Mjölk"],
    points: [{ n: 1, x: 10, y: 20 }],
  };

  it("reads a row as a PlacePhoto, with no points as null", () => {
    const parsed = placePhotoRowSchema.parse(row);
    expect(toPlacePhoto(parsed)).toEqual({
      id: photo,
      location: "Kyl",
      takenAt: new Date("2026-10-26T14:42:00Z"),
      width: 720,
      height: 900,
      reading: ["Mjölk"],
      points: [{ n: 1, x: 10, y: 20 }],
    });
    expect(toPlacePhoto(placePhotoRowSchema.parse({ ...row, points: [] })).points).toBeNull();
    expect(toPlacePhoto(placePhotoRowSchema.parse({ ...row, points: null })).points).toBeNull();
  });

  it("refuses a row that is not a photo's", () => {
    for (const bad of [
      { ...row, location: "Källare" },
      { ...row, taken_at: "igår" },
      { ...row, reading: "Mjölk" },
      { ...row, points: [{ n: 1, x: 2000, y: 1 }] },
      { ...row, width: 0 },
    ]) {
      expect(placePhotoRowSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("placePhotoCutoff", () => {
  it("is 30 days before now", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(placePhotoMaxAgeMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(placePhotoCutoff(now)).toEqual(new Date("2026-09-26T12:00:00Z"));
  });
});

describe("removePlacePhotoSchema", () => {
  it("takes a photo's id, a uuid", () => {
    expect(removePlacePhotoSchema.safeParse({ id: photo }).success).toBe(true);
    expect(removePlacePhotoSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});
