import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { FixedAction, fixedActionOffsetVar } from "./fixed-action";

beforeAll(() => {
  // FixedAction measures itself; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.style.removeProperty(fixedActionOffsetVar);
  document.documentElement.style.removeProperty("scroll-padding-bottom");
});

/**
 * jsdom has no layout: each button is `width` px wide on one line and 52 px
 * high, the bar `barWidth` px wide and `barHeight` px high, `top` px from the
 * top of an 812 px window.
 */
function fakeLayout({ width, barWidth, barHeight = 52, top = 676 }: { width: number; barWidth: number; barHeight?: number; top?: number }) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const box = (w: number, h: number, y = 0) => ({ width: w, height: h, top: y, x: 0, y, left: 0, right: w, bottom: y + h, toJSON: () => ({}) });
    if (this.dataset.testid === "fixed-action") return box(barWidth, barHeight, top) as DOMRect;
    return box(width, 52) as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.dataset.testid === "fixed-action" ? barWidth : width;
  });
}

const twoButtons = (
  <FixedAction>
    <Button variant="secondary">Skicka till ICA</Button>
    <Button>Lägg i lagret</Button>
  </FixedAction>
);
const names = () => screen.getAllByRole("button").map((button) => button.textContent);

// Fast åtgärdsknapp (Story 11.4): the row, the stacking and the inline bar,
// with a faked layout; the screenshots and the e2e spec at 375 px and 200 %
// check the real one.

describe("FixedAction", () => {
  it("puts two buttons that fit in one row, in equal halves, in their own order", () => {
    fakeLayout({ width: 140, barWidth: 343 });
    render(twoButtons);
    const bar = screen.getByTestId("fixed-action");
    expect(bar).toHaveAttribute("data-layout", "row");
    expect(bar).toHaveClass("flex-row", "*:grow", "*:basis-0", "*:min-w-fit", "*:max-w-full");
    expect(names()).toEqual(["Skicka till ICA", "Lägg i lagret"]);
  });

  it("stacks two buttons that do not fit, the last on top and first in the DOM, with labels that wrap", async () => {
    fakeLayout({ width: 200, barWidth: 343 });
    render(twoButtons);
    const bar = screen.getByTestId("fixed-action");
    await waitFor(() => expect(bar).toHaveAttribute("data-layout", "stacked"));
    expect(bar).toHaveClass("flex-col", "[&>button]:whitespace-normal", "[&>button]:h-auto", "[&>button]:min-h-button");
    // The reading and tab order follow what is seen.
    expect(names()).toEqual(["Lägg i lagret", "Skicka till ICA"]);
  });

  it("stands at the end of the page when it would take more than a quarter of the window", async () => {
    fakeLayout({ width: 200, barWidth: 343, barHeight: 260, top: 400 });
    render(twoButtons);
    await waitFor(() => expect(screen.getByTestId("fixed-action").parentElement).toHaveAttribute("data-fixed-action-inline"));
    // Nothing pinned: no offset for the toast, and no scroll padding.
    expect(document.documentElement.style.getPropertyValue(fixedActionOffsetVar)).toBe("");
    expect(document.documentElement.style.getPropertyValue("scroll-padding-bottom")).toBe("");
  });

  it("keeps focus above the buttons with scroll-padding, and tells the toast how far up they reach", () => {
    fakeLayout({ width: 140, barWidth: 343 });
    const { unmount } = render(twoButtons);
    expect(document.documentElement.style.getPropertyValue(fixedActionOffsetVar)).toContain("var(--fixed-action-gap)");
    // From the bar's top (676 px in a 768 px jsdom window) down, plus the gap.
    expect(document.documentElement.style.getPropertyValue("scroll-padding-bottom")).toBe(
      `calc(${window.innerHeight - 676}px + var(--fixed-action-gap))`,
    );
    unmount();
    expect(document.documentElement.style.getPropertyValue(fixedActionOffsetVar)).toBe("");
    expect(document.documentElement.style.getPropertyValue("scroll-padding-bottom")).toBe("");
  });
});
