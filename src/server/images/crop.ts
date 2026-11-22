import "server-only";
import sharp from "sharp";

// A crop of a stored photo round a box (the föremål's sheet, "Undersök värdet"): the box with a margin on every side,
// at least a third of the photo each way, so the föremål is large on the picture without losing what it stands on.
// Written as JPEG without any metadata. Never imports features or Supabase (AD-1); never logs the picture.

export type CropBox = { left: number; top: number; width: number; height: number };

const margin = 0.35;
const minShare = 0.33;

/** The region of a photo (in pixels) to keep round `box`: the box plus a margin, at least minShare of each side, inside the photo. */
export function cropRegion(box: CropBox, photo: { width: number; height: number }): { left: number; top: number; width: number; height: number } {
  const span = (start: number, length: number, total: number) => {
    const wanted = Math.min(1, Math.max(minShare, length * (1 + 2 * margin)));
    const middle = start + length / 2;
    const from = Math.min(1 - wanted, Math.max(0, middle - wanted / 2));
    return { from: Math.round(from * total), size: Math.max(1, Math.round(wanted * total)) };
  };
  const x = span(box.left, box.width, photo.width);
  const y = span(box.top, box.height, photo.height);
  return { left: x.from, top: y.from, width: Math.min(x.size, photo.width - x.from), height: Math.min(y.size, photo.height - y.from) };
}

/** The photo cropped round `box` as a JPEG, or `null` when it cannot be decoded or cropped (the caller then uses the whole photo). */
export async function cropAround(bytes: Uint8Array, box: CropBox): Promise<{ data: Uint8Array; mediaType: "image/jpeg" } | null> {
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
    const { width, height } = await image.metadata();
    if (!width || !height) return null;
    const region = cropRegion(box, { width, height });
    const data = await image.extract(region).jpeg({ quality: 85 }).toBuffer();
    return { data: new Uint8Array(data), mediaType: "image/jpeg" };
  } catch {
    return null;
  }
}
