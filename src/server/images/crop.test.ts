import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropAround, cropRegion } from "./crop";

// The crop round a föremål's box: the box with a margin, at least a third of the photo each way, always inside it.

describe("cropRegion", () => {
  const photo = { width: 1000, height: 800 };

  it("keeps the box with a 35 % margin on every side, inside the photo", () => {
    expect(cropRegion({ left: 0.4, top: 0.4, width: 0.2, height: 0.25 }, photo)).toEqual({ left: 330, top: 250, width: 340, height: 340 });
  });

  it("gives a small box at least a third of the photo each way", () => {
    const region = cropRegion({ left: 0.5, top: 0.5, width: 0.02, height: 0.02 }, photo);
    expect(region.width).toBe(330);
    expect(region.height).toBe(264);
  });

  it("slides a crop at an edge back inside the photo", () => {
    const corner = cropRegion({ left: 0, top: 0, width: 0.1, height: 0.1 }, photo);
    expect(corner.left).toBe(0);
    expect(corner.top).toBe(0);
    const far = cropRegion({ left: 0.95, top: 0.95, width: 0.05, height: 0.05 }, photo);
    expect(far.left + far.width).toBeLessThanOrEqual(1000);
    expect(far.top + far.height).toBeLessThanOrEqual(800);
  });

  it("is the whole photo for a box that fills it", () => {
    expect(cropRegion({ left: 0, top: 0, width: 1, height: 1 }, photo)).toEqual({ left: 0, top: 0, width: 1000, height: 800 });
  });
});

describe("cropAround", () => {
  it("returns a JPEG of the cropped region, smaller than the photo", async () => {
    const source = await sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
    const cropped = await cropAround(new Uint8Array(source), { left: 0.4, top: 0.4, width: 0.2, height: 0.2 });
    expect(cropped?.mediaType).toBe("image/jpeg");
    const info = await sharp(cropped?.data).metadata();
    expect(info.format).toBe("jpeg");
    expect(info.width).toBeLessThan(400);
    expect(info.height).toBeLessThan(300);
  });

  it("is null for bytes that are not a picture, so the whole photo is used", async () => {
    expect(await cropAround(new Uint8Array([1, 2, 3]), { left: 0.1, top: 0.1, width: 0.2, height: 0.2 })).toBeNull();
  });
});
