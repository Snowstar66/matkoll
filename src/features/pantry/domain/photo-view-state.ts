// Enhetlig fotovisning: zooming into a number and tapping back must land
// exactly where the view was, so what the view was is stored when zooming
// starts and put back when it ends. Pure (the scroller is anything with
// scrollTop and scrollLeft), so it is tested without a browser.

/** Anything that scrolls: the sheet's body. */
export type Scroller = { scrollTop: number; scrollLeft: number };

/** The view before zooming: the overview (not zoomed) and where it was scrolled. */
export type ViewSnapshot = { zoomed: false; scrollTop: number; scrollLeft: number };

/** Where the view stands: the number zoomed into (or `null` for the overview) and the overview to go back to. */
export type PhotoView = { selected: number | null; saved: ViewSnapshot | null };

/** The overview as it is now. */
export function captureView(scroller: Scroller | null): ViewSnapshot {
  return { zoomed: false, scrollTop: scroller?.scrollTop ?? 0, scrollLeft: scroller?.scrollLeft ?? 0 };
}

/** Puts the scroll position of `snapshot` back. */
export function restoreView(scroller: Scroller | null, snapshot: ViewSnapshot): void {
  if (!scroller) return;
  scroller.scrollTop = snapshot.scrollTop;
  scroller.scrollLeft = snapshot.scrollLeft;
}

/** The view opened at `selected` (a number zoomed into, e.g. from a row's camera) or at the overview. */
export function openView(selected: number | null): PhotoView {
  return { selected, saved: selected === null ? null : captureView(null) };
}

/**
 * A tap on a number. From the overview it stores the view first; when
 * already zoomed it only changes the number and keeps what was stored, so
 * going back always lands on the overview as it was before the first zoom.
 */
export function selectNumber(view: PhotoView, number: number, scroller: Scroller | null): PhotoView {
  return { selected: number, saved: view.selected === null ? captureView(scroller) : view.saved };
}

/** A tap on the photo: back to the overview, with the snapshot to restore (once the overview has laid out). */
export function backToOverview(view: PhotoView): { view: PhotoView; restore: ViewSnapshot | null } {
  return { view: { selected: null, saved: null }, restore: view.saved };
}
