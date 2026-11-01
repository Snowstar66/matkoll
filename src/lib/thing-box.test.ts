import { describe, expect, it } from "vitest";
import { boxFromThousandths, isValidBox } from "./thing-box";

describe("a föremål's box from the model (Story 18.7)", () => {
  it("is the corners in thousandths as fractions of the photo", () => {
    expect(boxFromThousandths([197, 153, 337, 364])).toEqual({ left: 0.197, top: 0.153, width: 0.14, height: 0.211 });
    expect(boxFromThousandths([0, 0, 500, 1000])).toEqual({ left: 0, top: 0, width: 0.5, height: 1 });
  });

  it("keeps a box of the whole photo: a close-up of one föremål", () => {
    expect(boxFromThousandths([0, 0, 1000, 1000])).toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it("clamps a corner just outside the photo onto it, and never reaches past its edge", () => {
    expect(boxFromThousandths([-4, 990, 300, 1006])).toEqual({ left: 0, top: 0.99, width: 0.3, height: 0.01 });
    const box = boxFromThousandths([333.33333, 0, 1000, 666.66666]);
    expect(box).not.toBeNull();
    expect(box && box.left + box.width).toBeLessThanOrEqual(1);
  });

  it.each([
    ["outside the photo", [100, 100, 1200, 300]],
    ["far outside", [-50, 0, 100, 100]],
    ["the corners swapped", [400, 400, 100, 100]],
    ["no width", [500, 100, 500, 900]],
    ["almost no height", [100, 100, 300, 103]],
    ["three numbers", [1, 2, 3]],
    ["five numbers", [1, 2, 3, 4, 5]],
    ["text", ["1", "2", "300", "400"]],
    ["not a number", [0, 0, Number.NaN, 100]],
    ["infinity", [0, 0, Number.POSITIVE_INFINITY, 100]],
    ["null", null],
    ["an object", { x1: 0, y1: 0, x2: 100, y2: 100 }],
  ])("is not saved for %s", (_name, value) => {
    expect(boxFromThousandths(value)).toBeNull();
  });

  it("checks a stored box: inside the photo and with a size", () => {
    expect(isValidBox({ left: 0.1, top: 0.2, width: 0.3, height: 0.4 })).toBe(true);
    expect(isValidBox({ left: 0.5, top: 0, width: 0.5, height: 1 })).toBe(true);
    expect(isValidBox({ left: -0.1, top: 0.2, width: 0.3, height: 0.4 })).toBe(false);
    expect(isValidBox({ left: 0.1, top: 0.2, width: 0, height: 0.4 })).toBe(false);
    expect(isValidBox({ left: 0.8, top: 0.2, width: 0.3, height: 0.4 })).toBe(false);
    expect(isValidBox({ left: 0.1, top: 0.2, width: Number.NaN, height: 0.4 })).toBe(false);
  });
});
