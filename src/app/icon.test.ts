import { describe, expect, it } from "vitest";
import AppleIcon, { contentType, size } from "./apple-icon";
import Icon, { generateImageMetadata } from "./icon";

// AD-27: the app icons are PNGs of the sizes the manifest and <head> say.

/** Width and height from a PNG's IHDR chunk. */
function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  expect([...bytes.slice(0, 8)]).toEqual(signature);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function png(response: Response) {
  expect(response.headers.get("content-type")).toBe("image/png");
  return new Uint8Array(await response.arrayBuffer());
}

describe("icon", () => {
  it("has the manifest's three icons", () => {
    expect(generateImageMetadata()).toEqual([
      { id: "192", contentType: "image/png", size: { width: 192, height: 192 } },
      { id: "512", contentType: "image/png", size: { width: 512, height: 512 } },
      { id: "maskable", contentType: "image/png", size: { width: 512, height: 512 } },
    ]);
  });

  it.each([
    ["192", 192],
    ["512", 512],
    ["maskable", 512],
  ])("draws /icon/%s as a %i px PNG", async (id, side) => {
    const bytes = await png(await Icon({ id: Promise.resolve(id) }));
    expect(pngSize(bytes)).toEqual({ width: side, height: side });
  });
});

describe("apple-icon", () => {
  it("is a 180 px PNG", async () => {
    expect(size).toEqual({ width: 180, height: 180 });
    expect(contentType).toBe("image/png");
    const bytes = await png(AppleIcon());
    expect(pngSize(bytes)).toEqual({ width: 180, height: 180 });
  });
});
