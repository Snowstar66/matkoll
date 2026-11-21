import { describe, expect, it } from "vitest";
import { comparePantryItems, snapshotFor, toSnapshot, withKeptPhotos, type PantryItem } from "./pantry-item";

const item = (overrides: Partial<PantryItem> & Pick<PantryItem, "id" | "name">): PantryItem => ({
  siteId: "hemma",
  ingredientId: `ingredient-${overrides.name}`,
  location: "Kyl",
  amount: null,
  unit: null,
  label: null,
  createdAt: "2026-10-20T10:00:00+00:00",
  section: "Mejeri",
  ...overrides,
});

describe("toSnapshot", () => {
  it("sums one ingredient and unit over locations and marks an item without amount unlimited", () => {
    const snapshot = toSnapshot([
      { ingredientId: "mjolk", amount: 1, unit: "l" },
      { ingredientId: "mjolk", amount: 1, unit: "l" },
      { ingredientId: "salt", amount: null, unit: null },
    ]);
    expect(snapshot).toEqual(
      new Map([
        ["mjolk", { unlimited: false, amounts: [{ unit: "l", amount: 2 }] }],
        ["salt", { unlimited: true, amounts: [] }],
      ]),
    );
  });

  it("keeps units apart, in the order of UNITS, and never converts them", () => {
    const snapshot = toSnapshot([
      { ingredientId: "mjol", amount: 2, unit: "dl" },
      { ingredientId: "mjol", amount: 1, unit: "kg" },
      { ingredientId: "mjol", amount: 500, unit: "g" },
      { ingredientId: "mjol", amount: 0.5, unit: "dl" },
    ]);
    expect(snapshot.get("mjol")).toEqual({
      unlimited: false,
      amounts: [
        { unit: "g", amount: 500 },
        { unit: "kg", amount: 1 },
        { unit: "dl", amount: 2.5 },
      ],
    });
  });

  it("is unlimited when any row has no amount, and still sums the rows that have one", () => {
    const snapshot = toSnapshot([
      { ingredientId: "smor", amount: 250, unit: "g" },
      { ingredientId: "smor", amount: null, unit: null },
    ]);
    expect(snapshot.get("smor")).toEqual({ unlimited: true, amounts: [{ unit: "g", amount: 250 }] });
  });

  it("drops binary noise from the sums", () => {
    const snapshot = toSnapshot([
      { ingredientId: "gradde", amount: 0.1, unit: "l" },
      { ingredientId: "gradde", amount: 0.2, unit: "l" },
      { ingredientId: "mjol", amount: 0.3, unit: "kg" },
      { ingredientId: "mjol", amount: 0.5, unit: "kg" },
    ]);
    expect(snapshot.get("gradde")?.amounts).toEqual([{ unit: "l", amount: 0.3 }]);
    expect(snapshot.get("mjol")?.amounts).toEqual([{ unit: "kg", amount: 0.8 }]);
  });

  it("gives an empty snapshot for an empty pantry", () => {
    expect(toSnapshot([])).toEqual(new Map());
  });
});

describe("comparePantryItems", () => {
  it("sorts by name in Swedish order, then unlimited first, then by unit and id", () => {
    const items = [
      item({ id: "1", name: "Ägg", amount: 6, unit: "st" }),
      item({ id: "2", name: "Ost", amount: 1, unit: "kg" }),
      item({ id: "3", name: "Mjölk", amount: 1, unit: "l" }),
      item({ id: "4", name: "Ost", amount: 200, unit: "g" }),
      item({ id: "5", name: "Ost" }),
      item({ id: "6", name: "Zucchini", amount: 1, unit: "st" }),
      item({ id: "7", name: "Åkerbär", amount: 1, unit: "dl" }),
      item({ id: "0", name: "mjölk", amount: 1, unit: "l" }),
    ];
    expect([...items].sort(comparePantryItems).map((entry) => entry.id)).toEqual(["0", "3", "5", "4", "2", "6", "7", "1"]);
  });
});

describe("snapshotFor", () => {
  it("keeps only the ingredients asked for that are at home", () => {
    const snapshot = toSnapshot([
      { ingredientId: "gradde", amount: 2, unit: "dl" },
      { ingredientId: "salt", amount: null, unit: null },
      { ingredientId: "mjol", amount: 1, unit: "kg" },
    ]);
    const part = snapshotFor(snapshot, ["gradde", "salt", null, "agg", "gradde"]);
    expect([...part.keys()]).toEqual(["gradde", "salt"]);
    expect(part.get("gradde")).toEqual(snapshot.get("gradde"));
  });
});

describe("withKeptPhotos", () => {
  const photoId = "photo-1";
  const urlOf = (id: string) => `/api/pantry/photo/${id}`;
  const stored = [
    {
      id: photoId,
      width: 720,
      height: 900,
      reading: ["Mjölk", "Gurka", "Vispgrädde 3 dl"],
      points: [{ n: 2, x: 300, y: 600 }, { n: 3, x: 100, y: 200 }],
      confirmedNumbers: [2, 3],
    },
  ];
  const links = [{ photoId, number: 2, name: "Gurka", location: "Kyl" as const }];

  it("marks the photo as kept, with its address, size, the item's point and every number's status", () => {
    const gurka = item({ id: "1", name: "Gurka", photo: { number: 2, photoId } });
    expect(withKeptPhotos([gurka], stored, urlOf, links)[0].photo).toEqual({
      number: 2,
      photoId,
      kept: {
        url: "/api/pantry/photo/photo-1",
        size: { width: 720, height: 900 },
        point: { x: 300, y: 600 },
        markers: [
          { n: 2, left: 30, top: 60, name: "Gurka", status: "present", location: "Kyl" },
          { n: 3, left: 10, top: 20, name: "Vispgrädde 3 dl", status: "gone", location: null },
        ],
      },
    });
  });

  it("keeps the photo without a point when the photo has none for the number", () => {
    const gurka = item({ id: "1", name: "Gurka", photo: { number: 1, photoId } });
    const kept = withKeptPhotos([gurka], stored, urlOf)[0].photo?.kept;
    expect(kept?.point).toBeNull();
    expect(kept?.url).toBe("/api/pantry/photo/photo-1");
  });

  it("leaves the link without a kept photo when the photo is swept, removed or its row is gone", () => {
    const swept = item({ id: "1", name: "Gurka", photo: { number: 2, photoId } });
    const gone = item({ id: "2", name: "Tomat", photo: { number: 1, photoId: null } });
    expect(withKeptPhotos([swept, gone], [], urlOf).map((row) => row.photo)).toEqual([
      { number: 2, photoId },
      { number: 1, photoId: null },
    ]);
  });

  it("returns items without a link as they are", () => {
    const mjolk = item({ id: "3", name: "Mjölk" });
    expect(withKeptPhotos([mjolk], stored, urlOf)[0]).toBe(mjolk);
  });
});
