import { crc32 } from "node:zlib";

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

/** A JPEG segment: marker, length and payload. */
function jpegSegment(marker: number, payload: number[]): number[] {
  return [0xff, marker, ...be16(payload.length + 2), ...payload];
}

/**
 * The distinctive text in jpegWithMetadata's and pngWithMetadata's metadata:
 * a made-up position, so a test can show it is gone. Never a real place.
 */
export const madeUpPosition = "12.3456789";

/**
 * Story 10.1: a JPEG with the metadata a phone writes, before its frame:
 * EXIF (APP1) with an IFD0 that points at a GPS IFD with a latitude, XMP
 * (another APP1) with madeUpPosition, an ICC profile (APP2) and a comment
 * (COM). Then the segments that make the image: a quantization table, the
 * frame header, a scan and the end. `metadata: false` gives the same file
 * without them: what stripJpegMetadata must give. Not decodable.
 */
export function jpegWithMetadata(width: number, height: number, { metadata = true }: { metadata?: boolean } = {}): Uint8Array {
  // TIFF, big-endian: IFD0 at 8 with one entry, GPSInfo (0x8825), pointing at the GPS IFD at 26.
  const gpsIfd = [...be16(2), ...be16(0x0001), ...be16(2), ...be32(2), ...ascii("N"), 0, 0, 0, ...be16(0x0002), ...be16(2), ...be32(4), ...ascii("12."), 0, ...be32(0)];
  const tiff = [...ascii("MM"), 0, 0x2a, ...be32(8), ...be16(1), ...be16(0x8825), ...be16(4), ...be32(1), ...be32(26), ...be32(0), ...gpsIfd];
  const exif = jpegSegment(0xe1, [...ascii("Exif"), 0, 0, ...tiff]);
  const xmp = jpegSegment(0xe1, [
    ...ascii("http://ns.adobe.com/xap/1.0/"),
    0,
    ...ascii(`<x:xmpmeta><rdf:Description exif:GPSLatitude="${madeUpPosition}"/></x:xmpmeta>`),
  ]);
  const icc = jpegSegment(0xe2, [...ascii("ICC_PROFILE"), 0, 1, 1, ...new Array(32).fill(7)]);
  const comment = jpegSegment(0xfe, ascii(`Taken at ${madeUpPosition}`));
  const app0 = jpegSegment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const dqt = jpegSegment(0xdb, [0, ...new Array(64).fill(1)]);
  const sof0 = jpegSegment(0xc0, [8, ...be16(height), ...be16(width), 3, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0]);
  const sos = jpegSegment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0]);
  const scan = [0x12, 0x34, 0x56, 0x78, 0xff, 0x00, 0x9a];
  return new Uint8Array([
    0xff, 0xd8,
    ...app0,
    ...(metadata ? [...exif, ...xmp, ...icc, ...comment] : []),
    ...dqt,
    ...sof0,
    ...sos,
    ...scan,
    0xff, 0xd9,
  ]);
}

/** A PNG chunk with its real CRC, for a file that other readers take too. */
function pngChunkWithCrc(type: string, data: number[]): Uint8Array {
  const body = new Uint8Array([...ascii(type), ...data]);
  return new Uint8Array([...be32(data.length), ...body, ...be32(crc32(body))]);
}

/**
 * Story 10.1: `png` (a real PNG, e.g. tests/fixtures/ai/kyl.png) with
 * metadata chunks after IHDR: tEXt with madeUpPosition, eXIf and tIME.
 */
export function pngWithMetadata(png: Uint8Array): Uint8Array {
  const afterIhdr = 8 + 25;
  const chunks = [
    pngChunkWithCrc("tEXt", [...ascii("Comment"), 0, ...ascii(`Taken at ${madeUpPosition}`)]),
    pngChunkWithCrc("eXIf", [...ascii("MM"), 0, 0x2a, ...be32(8), ...be16(0), ...be32(0)]),
    pngChunkWithCrc("tIME", [...be16(2026), 10, 26, 15, 42, 0]),
  ];
  return new Uint8Array([...png.subarray(0, afterIhdr), ...chunks.flatMap((chunk) => [...chunk]), ...png.subarray(afterIhdr)]);
}

/** The PNG's chunk types in order. */
export function pngChunkTypes(png: Uint8Array): string[] {
  const types: string[] = [];
  let at = 8;
  while (at + 8 <= png.length) {
    const length = ((png[at] << 24) | (png[at + 1] << 16) | (png[at + 2] << 8) | png[at + 3]) >>> 0;
    types.push(String.fromCharCode(...png.subarray(at + 4, at + 8)));
    at += 12 + length;
  }
  return types;
}

/** The JPEG's segment markers before its scan, in order (0xe1 for APP1, 0xfe for COM, …). */
export function jpegMarkers(jpeg: Uint8Array): number[] {
  const markers: number[] = [];
  let at = 2;
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1];
    markers.push(marker);
    if (marker === 0xda) break;
    at += 2 + ((jpeg[at + 2] << 8) | jpeg[at + 3]);
  }
  return markers;
}

/**
 * Review of Story 10.1: a progressive JPEG (SOF2) with two scans, the tables
 * between them, and with `metadata` APP1 (EXIF) before the frame, and APP1
 * (XMP with madeUpPosition) and a comment between the scans. `metadata:
 * false` gives the same file without them: what stripJpegMetadata must give.
 */
export function progressiveJpeg({ metadata = true }: { metadata?: boolean } = {}): Uint8Array {
  const app0 = jpegSegment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const exif = jpegSegment(0xe1, [...ascii("Exif"), 0, 0, ...ascii("MM"), 0, 0x2a, ...be32(8), ...be16(0), ...be32(0)]);
  const xmp = jpegSegment(0xe1, [...ascii("http://ns.adobe.com/xap/1.0/"), 0, ...ascii(`<x:xmpmeta GPS="${madeUpPosition}"/>`)]);
  const comment = jpegSegment(0xfe, ascii(`Between scans ${madeUpPosition}`));
  const dqt = jpegSegment(0xdb, [0, ...new Array(64).fill(1)]);
  const sof2 = jpegSegment(0xc2, [8, ...be16(600), ...be16(800), 3, 1, 0x22, 0, 2, 0x11, 0, 3, 0x11, 0]);
  const dht = jpegSegment(0xc4, [0, ...new Array(16).fill(0), 0]);
  const sos = jpegSegment(0xda, [1, 1, 0, 0, 0, 0]);
  return new Uint8Array([
    0xff, 0xd8,
    ...app0,
    ...(metadata ? exif : []),
    ...dqt,
    ...sof2,
    ...dht,
    ...sos,
    0x11, 0xff, 0x00, 0x22, 0xff, 0xd0, 0x33,
    ...(metadata ? [...xmp, ...comment] : []),
    ...dht,
    ...sos,
    0x44, 0x55,
    0xff, 0xd9,
  ]);
}

/** Bytes after a file's end, like the video an iPhone Live Photo or a "motion photo" appends. */
export const videoTrailer = new Uint8Array([0, 0, 0, 0x18, ...ascii("ftypmp42"), ...ascii(`GPS ${madeUpPosition}`)]);

/** `file` with `trailer` after it. */
export function withTrailer(file: Uint8Array, trailer: Uint8Array = videoTrailer): Uint8Array {
  return new Uint8Array([...file, ...trailer]);
}

/**
 * jpegWithMetadata's clean file with an APP0 of `kind`: a JFIF segment with
 * a 1 × 1 thumbnail, or a JFXX extension with a thumbnail. Both are left out.
 */
export function jpegWithThumbnail(kind: "jfif" | "jfxx"): Uint8Array {
  const clean = jpegWithMetadata(64, 48, { metadata: false });
  const thumbnail =
    kind === "jfif"
      ? jpegSegment(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0x10, 0x20, 0x30])
      : jpegSegment(0xe0, [...ascii("JFXX"), 0, 0x13, 1, 1, 0x10, 0x20, 0x30]);
  // After SOI and the bare JFIF APP0 (2 + 18 bytes).
  return new Uint8Array([...clean.subarray(0, 20), ...thumbnail, ...clean.subarray(20)]);
}
