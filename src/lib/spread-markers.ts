// Numbered markers on a photo, shared by Kylfoto and Förrådet. Pure.

/** Kylfoto: the least distance between two markers' middles, in pixels, so both show and can be tapped (22 px markers). */
export const markerGap = 26;

/**
 * Kylfoto: the markers nudged apart where they would overlap on a photo
 * shown `box` pixels large: each pair closer than `gap` is pushed apart
 * along the line between them (sideways when they sit on the same spot),
 * half each, a few rounds, and kept on the photo. Markers far apart are
 * untouched. Pure, in the markers' order.
 */
export function spreadMarkers<T extends { left: number; top: number }>(
  markers: readonly T[],
  box: { width: number; height: number },
  gap = markerGap,
): T[] {
  if (markers.length < 2 || box.width <= 0 || box.height <= 0) return [...markers];
  const at = markers.map((marker) => ({ x: (marker.left / 100) * box.width, y: (marker.top / 100) * box.height }));
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        const dx = at[j].x - at[i].x;
        const dy = at[j].y - at[i].y;
        const distance = Math.hypot(dx, dy);
        if (distance >= gap - 0.01) continue;
        const [ux, uy] = distance < 0.5 ? [1, 0] : [dx / distance, dy / distance];
        const push = (gap - distance) / 2;
        at[i] = { x: at[i].x - ux * push, y: at[i].y - uy * push };
        at[j] = { x: at[j].x + ux * push, y: at[j].y + uy * push };
        moved = true;
      }
    }
    for (const point of at) {
      point.x = Math.min(box.width, Math.max(0, point.x));
      point.y = Math.min(box.height, Math.max(0, point.y));
    }
    if (!moved) break;
  }
  return markers.map((marker, index) => ({
    ...marker,
    left: (at[index].x / box.width) * 100,
    top: (at[index].y / box.height) * 100,
  }));
}
