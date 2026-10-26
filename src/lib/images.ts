// Photos sent to the AI port (AD-15): the client resizes a photo to these
// limits before it is sent, and the server checks them again. The type and
// the size in pixels are read from the file's own bytes, never from what the
// sender says.

/** Longest side of a resized photo of a cookbook page, in pixels. */
export const maxImageSide = 1600;

/**
 * Longest side of a resized photo of a place at home (Story 6.5): small print
 * on packages needs more pixels than a cookbook page. A JPEG of 2048 px at
 * quality 0.85 is about 0.7 MB, well under maxImageBytes.
 */
export const maxPlacePhotoSide = 2048;

/** What the server lets a longest side exceed maxImageSide by, for rounding in other clients. */
export const imageSideTolerance = 16;

/** Largest photo the server takes: 1.5 MB. */
export const maxImageBytes = 1.5 * 1024 * 1024;

/** The image types the AI port takes. */
export const imageMediaTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof imageMediaTypes)[number];

export type ImageSize = { width: number; height: number };

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The image type from the file's first bytes: JPEG (FF D8 FF), PNG (its
 * 8-byte signature) or WebP (RIFF....WEBP). Anything else is `null`.
 */
export function imageTypeOf(bytes: Uint8Array): ImageMediaType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, pngSignature)) return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "image/webp";
  return null;
}

const u16be = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1];
const u16le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8);
const u24le = (bytes: Uint8Array, at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
const u32be = (bytes: Uint8Array, at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;

const valid = (size: ImageSize): ImageSize | null => (size.width > 0 && size.height > 0 ? size : null);

/** Width and height from PNG's IHDR chunk, which always comes first. */
function pngSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24 || !startsWith(bytes, ascii("IHDR"), 12)) return null;
  return valid({ width: u32be(bytes, 16), height: u32be(bytes, 20) });
}

/** Frame header markers (SOF0–SOF15) that carry the size; C4 (DHT), C8 (JPG) and CC (DAC) are not frames. */
const isFrameMarker = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/** Width and height from JPEG's first frame header, walking the segments from the start. */
function jpegSize(bytes: Uint8Array): ImageSize | null {
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    // Fill bytes before a marker.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Markers without a length: TEM and RST0–7. SOI or EOI here means a broken file.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(bytes, at + 2);
    if (length < 2) return null;
    if (isFrameMarker(marker)) {
      if (at + 9 > bytes.length) return null;
      return valid({ height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) });
    }
    at += 2 + length;
  }
  return null;
}

/** Width and height from WebP's first chunk: VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function webpSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 30) return null;
  if (startsWith(bytes, ascii("VP8 "), 12)) {
    // Frame tag (3 bytes), then the start code 9D 01 2A and 14-bit sizes.
    if (!startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) return null;
    return valid({ width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff });
  }
  if (startsWith(bytes, ascii("VP8L"), 12)) {
    if (bytes[20] !== 0x2f) return null;
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
    return valid({ width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 });
  }
  if (startsWith(bytes, ascii("VP8X"), 12)) {
    return valid({ width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 });
  }
  return null;
}

/**
 * The size in pixels as stored in the file's header, before any EXIF
 * rotation, or `null` when the bytes are not a JPEG, PNG or WebP whose header
 * can be read. Only the start of the file is needed.
 */
export function imageSizeOf(bytes: Uint8Array): ImageSize | null {
  switch (imageTypeOf(bytes)) {
    case "image/png":
      return pngSize(bytes);
    case "image/jpeg":
      return jpegSize(bytes);
    case "image/webp":
      return webpSize(bytes);
    default:
      return null;
  }
}

/**
 * The EXIF orientation (1–8) in a JPEG's APP1 segment, or 1 when there is
 * none. 5–8 mean the image is shown turned a quarter, with width and height
 * swapped.
 */
export function jpegOrientation(bytes: Uint8Array): number {
  if (imageTypeOf(bytes) !== "image/jpeg") return 1;
  let at = 2;
  while (at + 3 < bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    if (marker === 0xda || marker === 0xd9) return 1;
    const length = u16be(bytes, at + 2);
    if (length < 2) return 1;
    if (marker === 0xe1 && startsWith(bytes, [...ascii("Exif"), 0, 0], at + 4)) {
      const tiff = at + 10;
      const little = startsWith(bytes, ascii("II"), tiff);
      if (!little && !startsWith(bytes, ascii("MM"), tiff)) return 1;
      const read16 = (offset: number) => (little ? u16le(bytes, offset) : u16be(bytes, offset));
      const read32 = (offset: number) =>
        little ? ((u16le(bytes, offset + 2) << 16) | u16le(bytes, offset)) >>> 0 : u32be(bytes, offset);
      const ifd = tiff + read32(tiff + 4);
      if (ifd + 2 > bytes.length) return 1;
      const entries = read16(ifd);
      for (let entry = 0; entry < entries; entry++) {
        const offset = ifd + 2 + entry * 12;
        if (offset + 12 > bytes.length) return 1;
        if (read16(offset) === 0x0112) {
          const value = read16(offset + 8);
          return value >= 1 && value <= 8 ? value : 1;
        }
      }
      return 1;
    }
    at += 2 + length;
  }
  return 1;
}

/**
 * The PNG chunks a photo keeps on its way to the AI port: the image itself
 * and what changes how it looks. Everything else (text, EXIF, time, physical
 * size, colour profiles and the like) is metadata and is left out (AD-15).
 */
const keptPngChunks = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND", "gAMA", "cHRM", "sRGB"]);

/**
 * The PNG without its ancillary chunks (keptPngChunks), or `null` when the
 * bytes are not a PNG whose chunks can be walked to IEND. A PNG that has
 * nothing to remove comes back with the same bytes.
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array | null {
  if (!startsWith(bytes, pngSignature)) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, pngSignature.length)];
  let at = pngSignature.length;
  for (;;) {
    if (at + 12 > bytes.length) return null;
    const length = u32be(bytes, at);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (keptPngChunks.has(type)) parts.push(bytes.subarray(at, end));
    at = end;
    if (type === "IEND") break;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * The JPEG without its metadata segments before the image data: APP1–APP15
 * (EXIF with GPS, XMP, ICC) and comments. JFIF (APP0) and the segments that
 * decode the image stay. `null` when the bytes are not a JPEG whose segments
 * can be walked to the start of scan.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (imageTypeOf(bytes) !== "image/jpeg") return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  for (;;) {
    if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xda) {
      // Start of scan: the image data follows, up to the end.
      parts.push(bytes.subarray(at));
      break;
    }
    if (marker === 0xd8 || marker === 0xd9) return null;
    const end = at + 2 + u16be(bytes, at + 2);
    if (end > bytes.length) return null;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) parts.push(bytes.subarray(at, end));
    at = end;
  }
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
