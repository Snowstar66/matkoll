import "server-only";
import sharp from "sharp";

// Makes a recipe's picture ready to keep (recipe-images): decoded for real
// (what is not a picture of a known type is refused, whatever the sender's
// header said), turned upright by its EXIF orientation, scaled down to a full
// size and a thumbnail (never up), and written as WebP without any metadata
// (EXIF, GPS, ICC profile, comments: sharp writes none unless told to). Never
// imports features or Supabase (AD-1); never logs the picture.

export const recipeImageLimits = {
  /** Longest side of the full size and of the thumbnail, in pixels. */
  fullSide: 1200,
  thumbSide: 640,
  /** A picture smaller than this on its longest side is a tracking pixel or an icon, not a dish. */
  minSide: 64,
  /** The decoder refuses a picture of more pixels than this before it decodes it (a decompression bomb). */
  maxInputPixels: 40_000_000,
  /** A stored file stays under this, as the bucket's limit (1.5 MB). */
  maxOutputBytes: 1.5 * 1024 * 1024,
} as const;

/** The formats a recipe site's picture may have. SVG is a document, not a picture, and is never decoded. */
const knownFormats = new Set(["jpeg", "png", "webp", "gif", "avif"]);

export type StoredPicture = { bytes: Uint8Array; width: number; height: number };

export type PictureResult =
  | { ok: true; full: StoredPicture; thumb: StoredPicture }
  | { ok: false; reason: "not_image" | "too_small" | "too_large" };

async function render(bytes: Uint8Array, side: number, quality: number): Promise<StoredPicture> {
  const { data, info } = await sharp(bytes, { limitInputPixels: recipeImageLimits.maxInputPixels, failOn: "error" })
    .rotate()
    .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { bytes: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Decodes `bytes` and gives the full size and the thumbnail as WebP, or the
 * reason it is not kept: `not_image` (does not decode, or is a format that is
 * not accepted), `too_small` or `too_large` (too many pixels, or a file that
 * stays over the bucket's limit even at a low quality). Never throws.
 */
export async function makeRecipePictures(bytes: Uint8Array): Promise<PictureResult> {
  try {
    const metadata = await sharp(bytes, { limitInputPixels: recipeImageLimits.maxInputPixels, failOn: "error" }).metadata();
    if (!metadata.format || !knownFormats.has(metadata.format) || !metadata.width || !metadata.height) {
      return { ok: false, reason: "not_image" };
    }
    // With EXIF orientation 5-8 the stored width and height swap; the longest side is the same either way.
    if (Math.max(metadata.width, metadata.height) < recipeImageLimits.minSide) return { ok: false, reason: "too_small" };

    let full = await render(bytes, recipeImageLimits.fullSide, 80);
    if (full.bytes.byteLength > recipeImageLimits.maxOutputBytes) full = await render(bytes, recipeImageLimits.fullSide, 60);
    if (full.bytes.byteLength > recipeImageLimits.maxOutputBytes) return { ok: false, reason: "too_large" };
    const thumb = await render(bytes, recipeImageLimits.thumbSide, 75);
    return { ok: true, full, thumb };
  } catch (error) {
    // sharp's message names the problem ("Input buffer contains unsupported image format", "pixel limit"), never the picture.
    const message = error instanceof Error ? error.message : "";
    return { ok: false, reason: /pixel limit/i.test(message) ? "too_large" : "not_image" };
  }
}
