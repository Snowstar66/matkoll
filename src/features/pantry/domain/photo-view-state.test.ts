import { describe, expect, it } from "vitest";
import { backToOverview, captureView, openView, restoreView, selectNumber, type Scroller } from "./photo-view-state";

const scroller = (scrollTop: number, scrollLeft = 0): Scroller => ({ scrollTop, scrollLeft });

describe("photo view memory", () => {
  it("stores the scroll position of the overview when zooming starts and puts it back exactly", () => {
    const body = scroller(240, 36);
    const zoomed = selectNumber(openView(null), 3, body);
    expect(zoomed).toEqual({ selected: 3, saved: { zoomed: false, scrollTop: 240, scrollLeft: 36 } });

    // Zooming moves the sheet's scroll (the content got shorter), and going back restores it.
    body.scrollTop = 0;
    body.scrollLeft = 0;
    const back = backToOverview(zoomed);
    expect(back.view).toEqual({ selected: null, saved: null });
    restoreView(body, back.restore!);
    expect(body).toEqual({ scrollTop: 240, scrollLeft: 36 });
  });

  it("keeps the first overview when another number is chosen while zoomed in", () => {
    const body = scroller(120);
    let view = selectNumber(openView(null), 1, body);
    body.scrollTop = 5;
    view = selectNumber(view, 4, body);
    view = selectNumber(view, 2, body);
    expect(view.selected).toBe(2);
    expect(backToOverview(view).restore).toEqual({ zoomed: false, scrollTop: 120, scrollLeft: 0 });
  });

  it("goes back from a view that opened zoomed (a row's camera) to the top of the overview", () => {
    const view = openView(2);
    expect(view.selected).toBe(2);
    expect(backToOverview(view).restore).toEqual({ zoomed: false, scrollTop: 0, scrollLeft: 0 });
  });

  it("has nothing to restore from the overview, and survives a missing scroller", () => {
    expect(backToOverview(openView(null)).restore).toBeNull();
    expect(captureView(null)).toEqual({ zoomed: false, scrollTop: 0, scrollLeft: 0 });
    expect(() => restoreView(null, captureView(null))).not.toThrow();
  });
});
