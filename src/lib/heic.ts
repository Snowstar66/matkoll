import { fail, ok, type Result } from "./errors";

// iPhone photos (Story 18.16): a HEIC/HEIF image is read by Safari but not by
// Chrome or Firefox on a Mac. Before the photo is made small (downscaleImage),
// one that the browser cannot decode is turned into a JPEG in the browser, with
// the heic2any library, which is loaded only then (a dynamic import, so nobody
// else pays for it). The file is recognised by its own bytes (the `ftyp` box),
// not by its name or type, which a phone or a browser may leave empty.

/** How much of the file is read to see what it is. */
const sniffBytes = 64;

/** HEIC and HEIF brands (the major brand and the compatible ones of the `ftyp` box). */
const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);
/** AVIF files carry `mif1` as a compatible brand; every browser that has AVIF reads them, so they are left alone. */
const avifBrands = new Set(["avif", "avis"]);

const ascii = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.slice(at, at + 4));

/** Whether the first bytes are an ISO base media file of the HEIC/HEIF family (`ftyp` with a heic-like brand), and not AVIF. */
export function isHeicBytes(head: Uint8Array): boolean {
  if (head.length < 12 || ascii(head, 4) !== "ftyp") return false;
  const size = ((head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3]) >>> 0;
  const end = Math.min(head.length, size >= 16 ? size : head.length);
  const brands = [ascii(head, 8)];
  // The compatible brands start after the major brand (4) and its version (4).
  for (let at = 16; at + 4 <= end; at += 4) brands.push(ascii(head, at));
  if (avifBrands.has(brands[0])) return false;
  return brands.some((brand) => heifBrands.has(brand));
}

export type HeicDeps = {
  /** Whether this browser can decode the image itself (Safari can). */
  canDecode: (file: Blob) => Promise<boolean>;
  /** Turns the HEIC into a JPEG. Throws when it cannot. */
  convert: (file: Blob) => Promise<Blob>;
};

async function browserCanDecode(file: Blob): Promise<boolean> {
  if (typeof createImageBitmap !== "function") return false;
  try {
    (await createImageBitmap(file)).close();
    return true;
  } catch {
    return false;
  }
}

async function convertWithHeic2any(file: Blob): Promise<Blob> {
  // Loaded only when a HEIC the browser cannot read is chosen.
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const first = Array.isArray(converted) ? converted[0] : converted;
  if (!(first instanceof Blob) || first.size === 0) throw new Error("empty");
  return first;
}

const defaults: HeicDeps = { canDecode: browserCanDecode, convert: convertWithHeic2any };

/**
 * The file as something downscaleImage can read: the file itself when it is not
 * a HEIC or the browser reads HEIC; otherwise a JPEG made from it. Fails with
 * `image_heic_failed` when the conversion does not go (a broken file, no memory).
 */
export async function toDecodableImage(file: Blob, deps: Partial<HeicDeps> = {}): Promise<Result<Blob>> {
  const { canDecode, convert } = { ...defaults, ...deps };
  let head: Uint8Array;
  try {
    head = new Uint8Array(await file.slice(0, sniffBytes).arrayBuffer());
  } catch {
    return ok(file);
  }
  if (!isHeicBytes(head)) return ok(file);
  if (await canDecode(file)) return ok(file);
  try {
    return ok(await convert(file));
  } catch {
    return fail("image_heic_failed");
  }
}
