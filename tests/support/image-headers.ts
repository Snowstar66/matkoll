// Minimal image headers for unit tests: just enough bytes for imageTypeOf and
// imageSizeOf, padded with zeros to `size`. Not decodable images.

function padded(head: number[], size: number): Uint8Array {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return bytes;
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const be16 = (value: number) => [(value >> 8) & 0xff, value & 0xff];
const be32 = (value: number) => [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const le16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const le24 = (value: number) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];

/** A PNG signature and IHDR chunk. */
export function pngHeader(width: number, height: number, size = 64): Uint8Array {
  return padded(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be32(width), ...be32(height), 8, 2, 0, 0, 0],
    size,
  );
}

/** EXIF APP1 with a big-endian TIFF header and one IFD entry: Orientation = `orientation`. */
export function exifSegment(orientation: number): number[] {
  const tiff = [...ascii("MM"), 0, 0x2a, ...be32(8), ...be16(1), ...be16(0x0112), ...be16(3), ...be32(1), ...be16(orientation), 0, 0, ...be32(0)];
  const payload = [...ascii("Exif"), 0, 0, ...tiff];
  return [0xff, 0xe1, ...be16(payload.length + 2), ...payload];
}

/** SOI, a JFIF APP0, optionally EXIF, then a baseline frame header (SOF0). */
export function jpegHeader(width: number, height: number, { size = 64, orientation }: { size?: number; orientation?: number } = {}): Uint8Array {
  const app0 = [0xff, 0xe0, ...be16(16), ...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const sof0 = [0xff, 0xc0, ...be16(17), 8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return padded([0xff, 0xd8, ...app0, ...(orientation ? exifSegment(orientation) : []), ...sof0], size);
}

/** RIFF/WEBP with a VP8X chunk (extended format). */
export function webpVp8xHeader(width: number, height: number, size = 64): Uint8Array {
  return padded(
    [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(width - 1), ...le24(height - 1)],
    size,
  );
}

/** RIFF/WEBP with a VP8 chunk (lossy). */
export function webpVp8Header(width: number, height: number, size = 64): Uint8Array {
  return padded(
    [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8 "), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(width), ...le16(height)],
    size,
  );
}

/** RIFF/WEBP with a VP8L chunk (lossless). */
export function webpVp8lHeader(width: number, height: number, size = 64): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return padded(
    [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8L"), 0, 0, 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff],
    size,
  );
}

/** One PNG chunk: length, type, data and a zero CRC (nothing here checks it). */
export function pngChunk(type: string, data: number[] | Uint8Array = []): number[] {
  return [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

/**
 * A PNG whose chunks can be walked: signature, IHDR, then `chunks` (by
 * default one IDAT that pads the file to about `size` bytes), then IEND.
 */
export function pngFile(width: number, height: number, { size = 64, chunks }: { size?: number; chunks?: number[][] } = {}): Uint8Array {
  const ihdr = pngChunk("IHDR", [...be32(width), ...be32(height), 8, 2, 0, 0, 0]);
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr];
  const body = chunks ?? [pngChunk("IDAT", new Uint8Array(Math.max(0, size - head.length - 24)))];
  return new Uint8Array([...head, ...body.flat(), ...pngChunk("IEND")]);
}
