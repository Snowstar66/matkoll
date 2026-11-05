import { describe, expect, it } from "vitest";
import { boxesScale, parseLocatedBox, parseThings } from "./schemas";

const thing = (name: string, box: unknown) => ({ name, category: "Verktyg", where: null, confidence: "high", box, count: null });
const answer = (...boxes: unknown[]) => ({
  things: boxes.map((box, i) => thing(`Sak ${i}`, box)) as never,
  hiddenContainers: 0,
  hiddenNote: null,
});
const boxes = (result: ReturnType<typeof parseThings>) => result.things.map((entry) => entry.box);
const size = { width: 2048, height: 1536 };

describe("the scale of things boxes (whole answer, like the fridge's points)", () => {
  it("keeps thousandths as they are", () => {
    expect(boxesScale([[100, 200, 400, 500]], size)).toEqual({ x: 1, y: 1 });
    expect(boxes(parseThings(answer([100, 200, 400, 500])))).toEqual([{ left: 0.1, top: 0.2, width: 0.3, height: 0.3 }]);
  });

  it("reads fractions when every coordinate is at most 1 and some are not whole", () => {
    expect(boxes(parseThings(answer([0.1, 0.2, 0.4, 0.5], [0.5, 0.5, 1, 1])))).toEqual([
      { left: 0.1, top: 0.2, width: 0.3, height: 0.3 },
      { left: 0.5, top: 0.5, width: 0.5, height: 0.5 },
    ]);
  });

  it("reads the photo's pixels when a coordinate is past 1000 and all fit the photo", () => {
    const parsed = parseThings(answer([204.8, 153.6, 1024, 768], [1500, 300, 2000, 900]), size);
    expect(boxes(parsed)).toEqual([
      { left: 0.1, top: 0.1, width: 0.4, height: 0.4 },
      { left: 0.7324, top: 0.1953, width: 0.2441, height: 0.3906 },
    ]);
  });

  it("without a photo size, pixel boxes past the edge are left out, never the thing", () => {
    const parsed = parseThings(answer([1500, 300, 2000, 900]));
    expect(boxes(parsed)).toEqual([null]);
    expect(parsed.things).toHaveLength(1);
    expect(parsed.invalid).toBe(0);
  });

  it("stays in thousandths when a coordinate does not fit the photo", () => {
    expect(boxes(parseThings(answer([100, 100, 3000, 900]), size))).toEqual([null]);
  });

  it("clamps a corner slightly outside to the edge, and drops one far outside", () => {
    expect(boxes(parseThings(answer([-5, 500, 400, 1008])))).toEqual([{ left: 0, top: 0.5, width: 0.4, height: 0.5 }]);
    expect(boxes(parseThings(answer([-5, 500, 400, 1100])))).toEqual([null]);
  });

  it("ignores garbage when judging the scale, and keeps every thing", () => {
    const parsed = parseThings(answer("nope", [1, 2, 3], [0.1, "x", 0.3, 0.4], null, [0.2, 0.2, 0.6, 0.7]), size);
    expect(boxes(parsed)).toEqual([null, null, null, null, { left: 0.2, top: 0.2, width: 0.4, height: 0.5 }]);
    expect(parsed.things).toHaveLength(5);
    expect(boxesScale([null, "x", []], size)).toEqual({ x: 1, y: 1 });
  });

  it("applies the same detection to a located box", () => {
    const found = (box: unknown) => ({ found: true, box }) as never;
    expect(parseLocatedBox(found([197, 153, 337, 364]), size)).toEqual({ left: 0.197, top: 0.153, width: 0.14, height: 0.211 });
    expect(parseLocatedBox(found([0.2, 0.1, 0.5, 0.4]), size)).toEqual({ left: 0.2, top: 0.1, width: 0.3, height: 0.3 });
    expect(parseLocatedBox(found([409.6, 153.6, 1228.8, 768]), size)).toEqual({ left: 0.2, top: 0.1, width: 0.4, height: 0.4 });
    expect(parseLocatedBox({ found: false, box: [0.2, 0.1, 0.5, 0.4] } as never, size)).toBeNull();
    expect(parseLocatedBox(found(null), size)).toBeNull();
  });
});
