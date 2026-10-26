import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows nothing for the first 300 ms", () => {
    const { container } = render(<Skeleton rows={2} />);
    act(() => vi.advanceTimersByTime(299));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows card-shaped rows after 300 ms, with a loading text for screen readers", () => {
    render(<Skeleton rows={2} />);
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getAllByTestId("skeleton-row")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("Laddar …");
  });
});
