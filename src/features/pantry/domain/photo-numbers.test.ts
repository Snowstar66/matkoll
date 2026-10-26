import { describe, expect, it } from "vitest";
import { maxPantrySuggestions, maxSuggestionLabelChars } from "./pantry-suggestion";
import {
  cardNumber,
  locateLabelsSchema,
  locateResultSchema,
  locatingText,
  maxReadingItems,
  maxReadingLabelChars,
  numbersReadyText,
  photoMarkers,
  photoNumberText,
  photoNumbersStatus,
  hasNumberableCards,
  numberedCards,
  pointsByNumber,
  readingLabel,
  readingPlaceholder,
  readingSchema,
  type PhotoPoint,
} from "./photo-numbers";
import type { PantrySuggestion } from "./pantry-suggestion";

// Nummer på fotot (Story 6.6): the labels sent with the photo, the answer
// the client checks, a card's number and the markers on the photo.

const points = (...list: PhotoPoint[]) => new Map(list.map((point) => [point.n, point]));

describe("the reading", () => {
  it("has the analysis's limits: 25 items of at most 200 characters", () => {
    expect(maxReadingItems).toBe(maxPantrySuggestions);
    expect(maxReadingLabelChars).toBe(maxSuggestionLabelChars);
  });

  it("puts a label on one line without control or format characters, and calls an empty one vara", () => {
    expect(readingLabel("  Arla\nmellanmjölk\t 1,5 l ")).toBe("Arla mellanmjölk 1,5 l");
    expect(readingLabel("Ägg\u200b")).toBe("Ägg");
    expect(readingLabel("\u200b")).toBe("vara");
    const long = readingLabel(`${"x".repeat(199)}\u{1F95B}`);
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long).toBe("x".repeat(199));
  });

  it("is at most 25 one-line labels, possibly none", () => {
    expect(readingSchema.safeParse([]).success).toBe(true);
    expect(readingSchema.safeParse(Array.from({ length: 26 }, () => "x")).success).toBe(false);
  });

  it("takes 1 to 25 one-line labels to send, and nothing else", () => {
    expect(locateLabelsSchema.safeParse(["Mjölk"]).success).toBe(true);
    expect(locateLabelsSchema.safeParse(Array.from({ length: 25 }, () => "x".repeat(200))).success).toBe(true);
    for (const labels of [[], Array.from({ length: 26 }, () => "x"), [""], ["a\nb"], [" a"], ["x".repeat(201)], [1]]) {
      expect(locateLabelsSchema.safeParse(labels).success).toBe(false);
    }
  });
});

describe("the answer", () => {
  it("takes points with a number 1 to 25 and coordinates 0 to 1000", () => {
    expect(locateResultSchema.safeParse({ positions: [{ n: 1, x: 0, y: 1000 }] }).success).toBe(true);
    expect(locateResultSchema.safeParse({ positions: [] }).success).toBe(true);
    for (const point of [
      { n: 0, x: 1, y: 1 },
      { n: 26, x: 1, y: 1 },
      { n: 1.5, x: 1, y: 1 },
      { n: 1, x: 1001, y: 1 },
      { n: 1, x: 1, y: -1 },
      { n: 1, x: 1 },
    ]) {
      expect(locateResultSchema.safeParse({ positions: [point] }).success).toBe(false);
    }
  });

  it("keeps the first point per number", () => {
    const byNumber = pointsByNumber(
      {
        positions: [
          { n: 2, x: 1, y: 1 },
          { n: 2, x: 9, y: 9 },
        ],
      },
      ["Mjölk", "Smör"],
    );
    expect([...byNumber.values()]).toEqual([{ n: 2, x: 1, y: 1 }]);
  });

  it("ignores the point of a placeholder item, which keeps its number, and of a number beyond the reading", () => {
    expect(readingPlaceholder).toBe("vara");
    const byNumber = pointsByNumber(
      {
        positions: [
          { n: 1, x: 1, y: 1 },
          { n: 2, x: 2, y: 2 },
          { n: 3, x: 3, y: 3 },
          { n: 4, x: 4, y: 4 },
        ],
      },
      ["Mjölk", readingPlaceholder, "Smör"],
    );
    expect([...byNumber.keys()]).toEqual([1, 3]);
    // A card from the placeholder item gets no number, and no marker.
    expect(cardNumber({ itemNumbers: [2] }, byNumber)).toBeNull();
    expect(photoMarkers([{ itemNumbers: [2] }], byNumber)).toEqual([]);
  });
});

describe("the cards that can have numbers", () => {
  const card = (id: string, change: PantrySuggestion["change"], itemNumbers?: number[]) =>
    ({ id, change, itemNumbers }) as PantrySuggestion;

  it("are exactly the cards shown, Nytt and Ändrat, in their order", () => {
    const added = [card("s1", "new", [2])];
    const changed = [card("s2", "changed", [1])];
    expect(numberedCards({ added, changed }).map(({ id }) => id)).toEqual(["s1", "s2"]);
  });

  it("are worth a lookup only with a reading and a card with item numbers", () => {
    const added = [card("s1", "new", [1])];
    expect(hasNumberableCards({ added, changed: [] }, ["Mjölk"])).toBe(true);
    expect(hasNumberableCards({ added, changed: [] }, [])).toBe(false);
    expect(hasNumberableCards({ added: [card("s1", "new")], changed: [] }, ["Mjölk"])).toBe(false);
    // Only unchanged suggestions (no card) or only Syns inte längre: nothing to number.
    expect(hasNumberableCards({ added: [], changed: [] }, ["Mjölk"])).toBe(false);
  });
});

describe("cardNumber", () => {
  it("is the first of the card's item numbers that has a point, so it is on a marker of its own item", () => {
    expect(cardNumber({ itemNumbers: [3, 7] }, points({ n: 3, x: 1, y: 1 }))).toBe(3);
    expect(cardNumber({ itemNumbers: [3, 7] }, points({ n: 7, x: 1, y: 1 }))).toBe(7);
  });

  it("is none without points for its items, or without item numbers", () => {
    expect(cardNumber({ itemNumbers: [3] }, points({ n: 4, x: 1, y: 1 }))).toBeNull();
    expect(cardNumber({ itemNumbers: [] }, points({ n: 1, x: 1, y: 1 }))).toBeNull();
    expect(cardNumber({}, points({ n: 1, x: 1, y: 1 }))).toBeNull();
  });
});

describe("photoMarkers", () => {
  it("puts the card's number on each of its items with a point, in percent, once per item", () => {
    const cards = [{ itemNumbers: [2, 5] }, { itemNumbers: [2, 5] }, { itemNumbers: [1] }, { itemNumbers: [4] }];
    const markers = photoMarkers(cards, points({ n: 1, x: 193, y: 813 }, { n: 2, x: 500, y: 0 }, { n: 5, x: 1000, y: 250 }));
    expect(markers).toEqual([
      { key: 2, label: 2, left: 50, top: 0 },
      { key: 5, label: 2, left: 100, top: 25 },
      { key: 1, label: 1, left: 19.3, top: 81.3 },
    ]);
  });

  it("labels a card's markers with the number of its first item that has a point", () => {
    expect(photoMarkers([{ itemNumbers: [2, 5] }], points({ n: 5, x: 100, y: 100 }))).toEqual([
      { key: 5, label: 5, left: 10, top: 10 },
    ]);
  });

  it("has none before the points have come", () => {
    expect(photoMarkers([{ itemNumbers: [1] }], new Map())).toEqual([]);
  });
});

describe("texts", () => {
  it("names a card's number and says how the lookup goes", () => {
    expect(photoNumberText(3)).toBe("Nummer 3 på fotot");
    expect(photoNumbersStatus({ kind: "pending" }, false)).toBe(locatingText);
    expect(locatingText).toBe("Letar upp varorna på fotot …");
    expect(photoNumbersStatus({ kind: "ready", points: new Map() }, true)).toBe(numbersReadyText);
    expect(numbersReadyText).toBe("Numren på korten visar var varorna är på fotot.");
    // No numbers, or none on the cards left: nothing is said.
    expect(photoNumbersStatus({ kind: "ready", points: new Map() }, false)).toBe("");
    expect(photoNumbersStatus({ kind: "none" }, false)).toBe("");
  });
});
