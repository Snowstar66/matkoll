import { render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
  document.documentElement.style.removeProperty(fixedActionOffsetVar);
});

// Fast åtgärdsknapp (Story 11.4): jsdom has no layout, so the row and the
// stacking are checked as the classes that make them; the screenshots and
// the e2e spec at 375 px check the layout itself.

describe("FixedAction", () => {
  it("puts two buttons in one row that wraps with the last one on top, keeping the DOM order", () => {
    render(
      <FixedAction>
        <Button variant="secondary">Skicka till ICA</Button>
        <Button>Lägg i lagret</Button>
      </FixedAction>,
    );
    const bar = screen.getByTestId("fixed-action");
    // A row (flex, not flex-col) that wraps upwards: the wrapped line is the first child's, under the last.
    expect(bar).toHaveClass("flex", "flex-wrap-reverse");
    expect(bar).not.toHaveClass("flex-col");
    // Equal halves from a zero basis, but never narrower than the label.
    expect(bar).toHaveClass("*:grow", "*:basis-0", "*:min-w-fit");
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual(["Skicka till ICA", "Lägg i lagret"]);
  });

  it("tells the page how far up the buttons reach, and stops when it goes", () => {
    const { unmount } = render(
      <FixedAction>
        <Button>Lägg i lagret</Button>
      </FixedAction>,
    );
    expect(document.documentElement.style.getPropertyValue(fixedActionOffsetVar)).toContain("var(--fixed-action-gap)");
    unmount();
    expect(document.documentElement.style.getPropertyValue(fixedActionOffsetVar)).toBe("");
  });
});
