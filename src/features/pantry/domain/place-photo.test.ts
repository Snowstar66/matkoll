import { describe, expect, it } from "vitest";
import {
  clampTakenAt,
  maxTakenAtAgeMs,
  placePhotoFolder,
  placePhotoPath,
  placePhotoPointsSchema,
  readPlacePhotoForm,
  storedPoints,
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
