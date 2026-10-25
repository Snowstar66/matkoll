import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  exifSegment,
  jpegHeader,
  pngHeader,
  webpVp8Header,
  webpVp8lHeader,
  webpVp8xHeader,
} from "../../tests/support/image-headers";
import { imageSizeOf, imageTypeOf, jpegOrientation } from "./images";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...value].map((char) => char.charCodeAt(0)) : [value])));
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../tests/fixtures/ai/${name}`, import.meta.url)));

describe("imageTypeOf", () => {
  it.each([
    ["JPEG", jpegHeader(10, 10), "image/jpeg"],
    ["PNG", pngHeader(10, 10), "image/png"],
    ["WebP", webpVp8xHeader(10, 10), "image/webp"],
    ["the PNG fixture", fixture("ugnspannkaka.png"), "image/png"],
  ] as const)("reads %s", (_name, data, type) => {
    expect(imageTypeOf(data)).toBe(type);
  });

  it.each([
    ["nothing", new Uint8Array(0)],
    ["two bytes of JPEG", bytes(0xff, 0xd8)],
    ["a cut-off PNG signature", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a)],
    ["RIFF without the rest", bytes("RIFF")],
    ["a WAVE file", bytes("RIFF", 0, 0, 0, 0, "WAVE", "fmt ")],
    ["an AVI file", bytes("RIFF", 0, 0, 0, 0, "AVI ", "LIST")],
    ["a GIF", bytes("GIF89a", 1, 0, 1, 0)],
    ["HEIC", bytes(0, 0, 0, 0x18, "ftypheic")],
    ["text", bytes("Ugnspannkaka\n3 ägg")],
  ])("gives null for %s", (_name, data) => {
    expect(imageTypeOf(data)).toBeNull();
  });
});

describe("imageSizeOf", () => {
  it.each([
    ["PNG", pngHeader(768, 942), { width: 768, height: 942 }],
    ["JPEG", jpegHeader(4000, 3000), { width: 4000, height: 3000 }],
    ["JPEG with EXIF before the frame", jpegHeader(1600, 1200, { orientation: 6 }), { width: 1600, height: 1200 }],
    ["WebP VP8", webpVp8Header(1600, 900), { width: 1600, height: 900 }],
    ["WebP VP8L", webpVp8lHeader(1200, 1600), { width: 1200, height: 1600 }],
    ["WebP VP8X", webpVp8xHeader(5000, 3000), { width: 5000, height: 3000 }],
    ["the PNG fixture", fixture("ugnspannkaka.png"), { width: 768, height: 942 }],
    ["a reserved PNG", fixture("reserved-ai_invalid.png"), { width: 64, height: 64 }],
  ])("reads %s", (_name, data, size) => {
    expect(imageSizeOf(data)).toEqual(size);
  });

  it("reads a progressive JPEG (SOF2) after fill bytes", () => {
    const data = bytes(0xff, 0xd8, 0xff, 0xff, 0xc2, 0, 17, 8, 0x04, 0xb0, 0x06, 0x40, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
    expect(imageSizeOf(data)).toEqual({ width: 1600, height: 1200 });
  });

  it("skips a DHT segment (C4), which is not a frame", () => {
    const data = bytes(0xff, 0xd8, 0xff, 0xc4, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 10, 0, 20, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
    expect(imageSizeOf(data)).toEqual({ width: 20, height: 10 });
  });

  it.each([
    ["a JPEG cut off before its frame header", jpegHeader(100, 100).subarray(0, 20)],
    ["a JPEG whose scan starts before a frame", bytes(0xff, 0xd8, 0xff, 0xda, 0, 2)],
    ["a JPEG with a broken segment", bytes(0xff, 0xd8, 0x12, 0x34, 0, 0, 0, 0)],
    ["a PNG without IHDR first", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, "IDAT", 0, 0, 0, 1, 0, 0, 0, 1)],
    ["a PNG of zero width", pngHeader(0, 10)],
    ["a WebP with another chunk", bytes("RIFF", 0, 0, 0, 0, "WEBP", "ALPH", ...new Array(20).fill(0))],
    ["a WebP VP8 without its start code", bytes("RIFF", 0, 0, 0, 0, "WEBP", "VP8 ", ...new Array(20).fill(0))],
    ["a GIF", bytes("GIF89a", 1, 0, 1, 0)],
  ])("gives null for %s", (_name, data) => {
    expect(imageSizeOf(data)).toBeNull();
  });
});

describe("jpegOrientation", () => {
  it.each([1, 3, 6, 8])("reads orientation %i", (orientation) => {
    expect(jpegOrientation(jpegHeader(400, 300, { orientation }))).toBe(orientation);
  });

  it("reads little-endian EXIF too", () => {
    const segment = exifSegment(6);
    // Turn the TIFF part (after "Exif\0\0") little-endian: II, 2A 00, offset 8, one entry 0x0112 SHORT 1 value 6.
    const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 6, 0, 0, 0, 0, 0, 0, 0];
    const data = new Uint8Array([0xff, 0xd8, ...segment.slice(0, 10), ...tiff]);
    expect(jpegOrientation(data)).toBe(6);
  });

  it("is 1 without EXIF, for other types and for a value out of range", () => {
    expect(jpegOrientation(jpegHeader(400, 300))).toBe(1);
    expect(jpegOrientation(pngHeader(400, 300))).toBe(1);
    expect(jpegOrientation(jpegHeader(400, 300, { orientation: 9 }))).toBe(1);
  });
});
