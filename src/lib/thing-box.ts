// Where a föremål is on its card (Story 18.7): a box in normalized
// coordinates, 0 to 1 of the photo's width and height from its top left
// corner. The model answers in thousandths, [x1, y1, x2, y2] (the format Qwen's
// vision models are trained on, and one Claude follows); boxFromThousandths
// turns that into a box, or `null` for one that is not reasonable, which is
// never saved. Shared by the AI port and the things module, so it lives here.
// Pure.

export type ThingBox = { left: number; top: number; width: number; height: number };

/** The coordinate range of the model's answer: thousandths of the photo. */
export const boxScale = 1000;

/** How far outside the photo (in thousandths) a corner may be and still be clamped onto it; further out the box is refused. */
const edgeSlack = 10;

/** The smallest side of a box, in thousandths: anything less is a point, not a föremål. */
const minSide = 5;

/** A box covering at least this much of both sides (in thousandths) is the whole photo, not one föremål. */
const wholePhoto = 990;

/** A fraction rounded to four decimals: a tenth of a pixel on the largest card. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * The box of a model's answer `[x1, y1, x2, y2]` in thousandths, or `null`
 * when it is not reasonable: not four finite numbers, a corner further than
 * edgeSlack outside the photo, the corners in the wrong order, a side shorter
 * than minSide, or the whole photo.
 */
export function boxFromThousandths(value: unknown): ThingBox | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  if (!value.every((n): n is number => typeof n === "number" && Number.isFinite(n))) return null;
  if (value.some((n) => n < -edgeSlack || n > boxScale + edgeSlack)) return null;
  const [x1, y1, x2, y2] = value.map((n) => Math.min(boxScale, Math.max(0, n)));
  const width = x2 - x1;
  const height = y2 - y1;
  if (width < minSide || height < minSide) return null;
  if (width >= wholePhoto && height >= wholePhoto) return null;
  return toBox(x1 / boxScale, y1 / boxScale, width / boxScale, height / boxScale);
}

/** A box rounded so that it never reaches past the photo's right or bottom edge. */
function toBox(left: number, top: number, width: number, height: number): ThingBox {
  const l = round(left);
  const t = round(top);
  return { left: l, top: t, width: Math.min(round(width), round(1 - l)), height: Math.min(round(height), round(1 - t)) };
}

/** True for a stored box: every value a finite number, inside the photo, and with a size (thing_item_box_check holds the same). */
export function isValidBox(box: ThingBox): boolean {
  const { left, top, width, height } = box;
  if (![left, top, width, height].every(Number.isFinite)) return false;
  return left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 1.0001 && top + height <= 1.0001;
}
