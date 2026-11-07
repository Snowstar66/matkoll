import { describe, expect, it } from "vitest";
import {
  boxColumnsOf,
  boxOfRow,
  cardHintText,
  cardViewHref,
  cardViewMeta,
  cardViewTitle,
  markedText,
  dotNearPoint,
  spotlightRadius,
  thingDots,
  thingBoxSchema,
} from "./thing-card";

const row = (box: [number | null, number | null, number | null, number | null]) => ({ box_left: box[0], box_top: box[1], box_width: box[2], box_height: box[3] });

describe("the big view of a card (Story 18.7)", () => {
  it("reads a stored box, and none when a value is missing or it is not inside the photo", () => {
    expect(boxOfRow(row([0.1, 0.2, 0.3, 0.4]))).toEqual({ left: 0.1, top: 0.2, width: 0.3, height: 0.4 });
    expect(boxOfRow(row([null, null, null, null]))).toBeNull();
    expect(boxOfRow(row([0.1, null, 0.3, 0.4]))).toBeNull();
    expect(boxOfRow(row([0.9, 0.2, 0.3, 0.4]))).toBeNull();
  });

  it("gives back the box columns for Ångra: the box, or that a lookup found nothing", () => {
    expect(boxColumnsOf({ box: { left: 0.1, top: 0.2, width: 0.3, height: 0.4 }, boxMissed: false })).toEqual({
      box_left: 0.1,
      box_top: 0.2,
      box_width: 0.3,
      box_height: 0.4,
      box_missed: false,
    });
    expect(boxColumnsOf({ box: null, boxMissed: true })).toMatchObject({ box_left: null, box_missed: true });
    // A box and a miss never go together.
    expect(boxColumnsOf({ box: { left: 0, top: 0, width: 1, height: 1 }, boxMissed: true }).box_missed).toBe(false);
  });

  it("takes only a box inside the photo from a snapshot", () => {
    expect(thingBoxSchema.safeParse({ left: 0.1, top: 0.2, width: 0.3, height: 0.4 }).success).toBe(true);
    expect(thingBoxSchema.safeParse({ left: 0.9, top: 0.2, width: 0.3, height: 0.4 }).success).toBe(false);
    expect(thingBoxSchema.safeParse({ left: 0.1, top: 0.2, width: 0.3 }).success).toBe(false);
  });

  it("opens with a föremål marked, or none", () => {
    expect(cardViewHref("c1")).toBe("/prylar/kort/c1");
    expect(cardViewHref("c1", "t1")).toBe("/prylar/kort/c1?foremal=t1");
    expect(cardViewHref("c1", null)).toBe("/prylar/kort/c1");
  });

  it("is titled by the room, the part or the box, with the place, the date and the count under it", () => {
    const card = { room: "Boden", part: null, kind: "part" as const, takenAt: "2026-10-30T10:00:00Z", things: [{}, {}] };
    expect(cardViewTitle(card)).toBe("Boden");
    expect(cardViewMeta(card)).toBe("Hela rummet · Kort från 30 okt · 2 föremål");
    expect(cardViewTitle({ ...card, part: "Hyllan" })).toBe("Hyllan");
    expect(cardViewMeta({ ...card, part: "Hyllan", things: [{}] })).toBe("Boden · Kort från 30 okt · 1 föremål");
    expect(cardViewTitle({ ...card, part: "Black box", kind: "box" })).toBe("Låda: Black box");
  });

  it("says how to mark, or how to look one up when the card has no boxes, and what is marked", () => {
    expect(cardHintText([{ box: null }, { box: { left: 0, top: 0, width: 0.1, height: 0.1 } }])).toBe("Tryck på ett föremål eller en siffra på fotot för att markera det.");
    expect(cardHintText([{ box: null }])).toBe("Tryck på ett föremål för att leta upp det på bilden.");
    expect(markedText({ name: "Hammare", whereHint: "på väggen, mitten" })).toBe("Hammare · på väggen, mitten");
    expect(markedText({ name: "Hammare", whereHint: null })).toBe("Hammare");
  });

  it("numbers the föremål that have a box in the list's order, with the dot at the middle of the box", () => {
    const shelf = { id: "shelf", box: { left: 0.1, top: 0.1, width: 0.8, height: 0.5 } };
    const hammer = { id: "hammer", box: { left: 0.2, top: 0.2, width: 0.1, height: 0.1 } };
    const none = { id: "none", box: null };
    const dots = thingDots([none, shelf, hammer]);
    expect(dots.map((dot) => [dot.id, dot.number])).toEqual([["shelf", 1], ["hammer", 2]]);
    expect(dots[0].left).toBeCloseTo(50);
    expect(dots[0].top).toBeCloseTo(35);
    expect(dots[1].left).toBeCloseTo(25);
  });

  it("finds the dot nearest to a tap within a finger's width, and none when it is far", () => {
    const size = { width: 400, height: 300 };
    const dots = [
      { id: "a", number: 1, left: 25, top: 25 },
      { id: "b", number: 2, left: 30, top: 25 },
    ];
    // 25 % of 400 px = 100 px; b is 20 px to the right of a.
    expect(dotNearPoint(dots, 0.26, 0.25, size)?.id).toBe("a");
    expect(dotNearPoint(dots, 0.29, 0.25, size)?.id).toBe("b");
    expect(dotNearPoint(dots, 0.25, 0.25 + 29 / 300, size)?.id).toBe("a");
    expect(dotNearPoint(dots, 0.25, 0.25 + 40 / 300, size)).toBeNull();
    expect(dotNearPoint(dots, 0.9, 0.9, size)).toBeNull();
    expect(dotNearPoint([], 0.5, 0.5, size)).toBeNull();
  });

  it("sizes the spotlight from the box's smaller side, within 44 and 110 px", () => {
    const size = { width: 400, height: 300 };
    expect(spotlightRadius({ left: 0, top: 0, width: 0.5, height: 0.2 }, size)).toBe(45);
    expect(spotlightRadius({ left: 0, top: 0, width: 0.01, height: 0.01 }, size)).toBe(44);
    expect(spotlightRadius({ left: 0, top: 0, width: 1, height: 1 }, size)).toBe(110);
    expect(spotlightRadius({ left: 0, top: 0, width: 0.5, height: 0.5 }, null)).toBe(64);
  });
});
