import "server-only";
import { crc32, deflateSync } from "node:zlib";

// The photo of the warm-up (Story 12.2): a grey PNG of 64 × 64 px, built here
// once, so no file ships with the app and no photo of Pontus is ever used.
// Only its size and its being an image matter: it goes through the model's
// image encoder as a real photo would, and the answer is thrown away.

export const warmImageSide = 64;

/** The grey of every pixel (RGB). */
const grey = 128;

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function greyPng(side: number): Uint8Array {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(side, 0);
  header.writeUInt32BE(side, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // truecolour (RGB), which every image encoder takes
  // Compression, filter and interlace stay 0.
  const row = Buffer.alloc(1 + side * 3, grey);
  row[0] = 0; // filter type None
  const pixels = Buffer.concat(Array.from({ length: side }, () => row));
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(
    Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", new Uint8Array(0))]),
  );
}

/** The warm-up's image, as the port sends a photo: a `file` part's data and media type. */
export const warmImage = { data: greyPng(warmImageSide), mediaType: "image/png" } as const;
