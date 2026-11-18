import { describe, expect, it } from "vitest";
import { scrollToTap, tapFractions } from "./photo-zoom";

describe("tapFractions", () => {
  it("is where on the box the finger was", () => {
    expect(tapFractions({ x: 150, y: 120 }, { left: 50, top: 20, width: 200, height: 200 })).toEqual({ fx: 0.5, fy: 0.5 });
    expect(tapFractions({ x: 50, y: 20 }, { left: 50, top: 20, width: 200, height: 200 })).toEqual({ fx: 0, fy: 0 });
  });
  it("is the middle for a box with no size", () => {
    expect(tapFractions({ x: 1, y: 1 }, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ fx: 0.5, fy: 0.5 });
  });
});

describe("scrollToTap", () => {
  const frame = { left: 0, top: 40, width: 3000, height: 2000 };
  const viewport = { width: 375, height: 600 };

  it("centres a tap in the middle of the photo", () => {
    expect(scrollToTap({ fx: 0.5, fy: 0.5 }, frame, viewport)).toEqual({ left: 1313, top: 740 });
  });

  it("lands on the tapped item, far from the top left, not on the corner", () => {
    const result = scrollToTap({ fx: 0.9, fy: 0.8 }, frame, viewport);
    expect(result.left).toBe(Math.round(0.9 * 3000 - 187.5));
    expect(result.top).toBe(Math.round(40 + 0.8 * 2000 - 300));
  });

  it("never scrolls below zero, for a tap near the corner", () => {
    expect(scrollToTap({ fx: 0.01, fy: 0.01 }, frame, viewport)).toEqual({ left: 0, top: 0 });
  });

  it("keeps a tap outside the photo inside it", () => {
    expect(scrollToTap({ fx: -2, fy: 5 }, frame, viewport)).toEqual({ left: 0, top: Math.round(40 + 2000 - 300) });
  });
});
