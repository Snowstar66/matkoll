import { fail, ok, type Result } from "./errors";
import {
  imageSizeOf,
  imageTypeOf,
  jpegOrientation,
  maxImageBytes,
  maxImageSide,
  stripPngMetadata,
  type ImageSize,
} from "./images";

// A photo for the AI port (a cookbook page in Importera recept, a place in
// Hemma) is made small in the browser before it is sent (AD-15): at most
// 1600 px on the longest side (2048 px for a place, Story 6.5, given as
// `maxSide`) and at most 1.5 MB, as JPEG, turned the way the
// camera held it. Every photo is re-encoded through a canvas, which drops EXIF,
// GPS included, except a PNG that already fits: it is sent with its metadata
// chunks removed (stripPngMetadata), since re-encoding only loses detail.
// Nothing is stored; the result is only kept in memory for "Försök igen".
//
// A phone photo is 12–48 megapixels, so decoding it in full can run a phone
// out of memory. Where the browser can, it decodes straight to the smaller
// size (createImageBitmap with resizeWidth/resizeHeight). Otherwise the full
// image is drawn down in halving steps with high-quality smoothing, so small
// print stays sharp.

/** JPEG qualities to try, best first, until the photo fits in maxImageBytes. */
export const jpegQualities = [0.85, 0.75, 0.65, 0.5] as const;

/** How much of the file is read for its header (size and EXIF orientation). */
const headerBytes = 128 * 1024;

/** The size that fits within `max` pixels on the longest side, keeping the proportions. Never larger than the original. */
export function fitWithin(width: number, height: number, max: number = maxImageSide): ImageSize {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.min(max, Math.max(1, Math.round(width * scale))),
    height: Math.min(max, Math.max(1, Math.round(height * scale))),
  };
}

/**
 * The sizes to draw through on the way from `from` down to `to`: each step at
 * most halves the image, so smoothing sees every pixel. The last is `to`.
 */
export function halvingSteps(from: ImageSize, to: ImageSize): ImageSize[] {
  const steps: ImageSize[] = [];
  let { width, height } = from;
  while (width > to.width * 2 || height > to.height * 2) {
    width = Math.max(to.width, Math.ceil(width / 2));
    height = Math.max(to.height, Math.ceil(height / 2));
    steps.push({ width, height });
  }
  steps.push(to);
  return steps;
}

/** A browser that ran out of memory: RangeError, or an error that says so. */
function isMemoryError(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  // Not only Error: a DOMException does not extend Error everywhere.
  if (typeof error !== "object" || error === null) return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return /memory|allocat/i.test(`${String(name)} ${String(message)}`);
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };
type Decoding = { ok: true; decoded: Decoded } | { ok: false; code: "image_unsupported" | "image_too_large" };

const fromBitmap = (bitmap: ImageBitmap): Decoded => ({
  source: bitmap,
  width: bitmap.width,
  height: bitmap.height,
  release: () => bitmap.close(),
});

/**
 * Decodes the file in full, turned by its EXIF orientation. createImageBitmap
 * first; a browser that does not take its options (older Safari) or cannot
 * decode the file that way gets a second try through <img>, which also
 * follows the orientation. Running out of memory is `image_too_large`; a file
 * neither can read (e.g. HEIC in Chrome) is `image_unsupported`.
 */
async function decodeFull(file: Blob): Promise<Decoding> {
  if (typeof createImageBitmap === "function") {
    try {
      return { ok: true, decoded: fromBitmap(await createImageBitmap(file, { imageOrientation: "from-image" })) };
    } catch (error) {
      if (isMemoryError(error)) return { ok: false, code: "image_too_large" };
      // Try <img> below.
    }
  }
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") return { ok: false, code: "image_unsupported" };
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      ok: true,
      decoded: { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) },
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    return { ok: false, code: isMemoryError(error) ? "image_too_large" : "image_unsupported" };
  }
}

/**
 * Decodes straight to `target`, turned by its EXIF orientation, where the
 * browser supports resizing in createImageBitmap. `null` when it does not, or
 * when the result is not `target` (options ignored, or resized before it was
 * turned): the caller then decodes in full.
 */
async function decodeResized(file: Blob, target: ImageSize): Promise<Decoded | null | "out_of_memory"> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
      resizeWidth: target.width,
      resizeHeight: target.height,
      resizeQuality: "high",
    });
    if (bitmap.width === target.width && bitmap.height === target.height) return fromBitmap(bitmap);
    bitmap.close();
    return null;
  } catch (error) {
    return isMemoryError(error) ? "out_of_memory" : null;
  }
}

function canvasOf({ width, height }: ImageSize): { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return { canvas, context };
}

/** The decoded image drawn at `target` on a white page, in halving steps from a larger source. `null` when a canvas cannot be had (memory). */
function drawDown(decoded: Decoded, target: ImageSize): HTMLCanvasElement | null {
  let source: CanvasImageSource = decoded.source;
  let sourceSize: ImageSize = decoded;
  const steps = halvingSteps(decoded, target);
  for (const [index, size] of steps.entries()) {
    const drawn = canvasOf(size);
    if (!drawn) return null;
    if (index === steps.length - 1) {
      // JPEG has no transparency: a transparent PNG gets a white page instead of a black one.
      drawn.context.fillStyle = "white";
      drawn.context.fillRect(0, 0, size.width, size.height);
    }
    drawn.context.drawImage(source, 0, 0, sourceSize.width, sourceSize.height, 0, 0, size.width, size.height);
    // Let the previous step's pixels go.
    if (source instanceof HTMLCanvasElement) source.width = source.height = 0;
    source = drawn.canvas;
    sourceSize = size;
  }
  return source as HTMLCanvasElement;
}

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * The photo as it is sent: a JPEG of at most `maxSide` px on the longest side
 * (maxImageSide, 1600, unless given) and
 * at most 1.5 MB, with lower quality tried until it fits. A PNG that already
 * fits, and that the browser shows at the size in its header (no rotation),
 * is sent with only its image chunks (stripPngMetadata: no text, EXIF or
 * time), since re-encoding only loses detail; one whose chunks cannot be
 * read is re-encoded. Fails with
 * `image_unsupported` when the file cannot be decoded and `image_too_large`
 * when even the lowest quality is too large or the browser runs out of
 * memory; nothing is sent then.
 */
export async function downscaleImage(
  file: Blob,
  { maxSide = maxImageSide }: { maxSide?: number } = {},
): Promise<Result<Blob>> {
  const head = new Uint8Array(await file.slice(0, headerBytes).arrayBuffer());
  const type = imageTypeOf(head);
  const stored = imageSizeOf(head);
  // The size as shown: orientations 5–8 turn the image a quarter.
  const shown = stored && type === "image/jpeg" && jpegOrientation(head) >= 5 ? { width: stored.height, height: stored.width } : stored;

  let decoded: Decoded | null = null;
  if (shown) {
    const target = fitWithin(shown.width, shown.height, maxSide);
    if (target.width !== shown.width || target.height !== shown.height) {
      const resized = await decodeResized(file, target);
      if (resized === "out_of_memory") return fail("image_too_large");
      decoded = resized;
    }
  }
  if (!decoded) {
    const full = await decodeFull(file);
    if (!full.ok) return fail(full.code);
    decoded = full.decoded;
  }

  try {
    const { width, height } = decoded;
    if (!width || !height) return fail("image_unsupported");
    const target = fitWithin(width, height, maxSide);

    const unturnedPng =
      type === "image/png" && stored !== null && stored.width === width && stored.height === height;
    if (unturnedPng && target.width === width && target.height === height && file.size <= maxImageBytes) {
      const stripped = stripPngMetadata(new Uint8Array(await file.arrayBuffer()));
      if (stripped) return ok(new Blob([stripped as BlobPart], { type: "image/png" }));
    }

    let canvas: HTMLCanvasElement | null;
    try {
      canvas = drawDown(decoded, target);
    } catch (error) {
      if (isMemoryError(error)) return fail("image_too_large");
      throw error;
    }
    // No canvas, or no JPEG from it: the browser is out of memory for this photo.
    if (!canvas) return fail("image_too_large");

    for (const quality of jpegQualities) {
      const blob = await toJpeg(canvas, quality);
      if (!blob) return fail("image_too_large");
      if (blob.size <= maxImageBytes) return ok(blob);
    }
    return fail("image_too_large");
  } finally {
    decoded.release();
  }
}
