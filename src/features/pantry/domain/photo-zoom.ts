// A tap on a photo shows it at full size; the view then has to land where the finger was, not at the photo's top left
// (a fridge photo is wide: the item tapped was often far from the corner). Pure, so it is tested without a browser.

/** Where on the photo the tap was, as fractions (0 to 1) of its width and height. */
export type TapOnPhoto = { fx: number; fy: number };

/**
 * The scroll position that puts the tapped point in the middle of the visible area, never below 0.
 * `frame` is the full-size photo's box measured from the scrolled content's own origin (so with the scroll at 0),
 * `viewport` the size of the visible area.
 */
export function scrollToTap(
  tap: TapOnPhoto,
  frame: { left: number; top: number; width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const fx = Math.min(1, Math.max(0, tap.fx));
  const fy = Math.min(1, Math.max(0, tap.fy));
  return {
    left: Math.max(0, Math.round(frame.left + fx * frame.width - viewport.width / 2)),
    top: Math.max(0, Math.round(frame.top + fy * frame.height - viewport.height / 2)),
  };
}

/** The tap as fractions of the box it hit (`box` from getBoundingClientRect); the middle for a box with no size. */
export function tapFractions(point: { x: number; y: number }, box: { left: number; top: number; width: number; height: number }): TapOnPhoto {
  if (box.width <= 0 || box.height <= 0) return { fx: 0.5, fy: 0.5 };
  return { fx: (point.x - box.left) / box.width, fy: (point.y - box.top) / box.height };
}
