import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { clampMeterValue, Meter } from "./meter";

const fill = () => screen.getByTestId("meter").firstElementChild as HTMLElement;

describe("Meter", () => {
  it("fills its share in accent on a hairline track and is hidden from screen readers", () => {
    render(<Meter value={0.43} />);
    const meter = screen.getByTestId("meter");
    expect(meter).toHaveAttribute("aria-hidden", "true");
    expect(meter).toHaveClass("h-meter", "bg-hairline", "rounded-full");
    expect(fill()).toHaveClass("bg-accent");
    expect(fill().style.width).toBe("43%");
  });

  it("shows the track and fill in forced colours", () => {
    render(<Meter value={0.5} />);
    expect(screen.getByTestId("meter")).toHaveClass("forced-colors:border", "forced-colors:border-[CanvasText]");
    expect(fill()).toHaveClass("forced-colors:bg-[Highlight]", "forced-colors:forced-color-adjust-none");
  });

  it("has a small size for dish cards", () => {
    render(<Meter value={0.75} size="small" />);
    expect(screen.getByTestId("meter")).toHaveClass("h-meter-small");
    expect(screen.getByTestId("meter")).not.toHaveClass("h-meter");
  });

  it.each([
    [-0.5, "0%"],
    [0, "0%"],
    [1, "100%"],
    [1.7, "100%"],
    [Number.NaN, "0%"],
    [Number.POSITIVE_INFINITY, "100%"],
    [Number.NEGATIVE_INFINITY, "0%"],
  ])("clamps %s to %s", (value, width) => {
    render(<Meter value={value} />);
    expect(fill().style.width).toBe(width);
  });

  it("clampMeterValue keeps 0–1", () => {
    expect(clampMeterValue(0.25)).toBe(0.25);
    expect(clampMeterValue(-1)).toBe(0);
    expect(clampMeterValue(3)).toBe(1);
  });
});
