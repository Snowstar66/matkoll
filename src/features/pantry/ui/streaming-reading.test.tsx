import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StreamingReading, type StreamingReadingView } from "./streaming-reading";

// Kylfoto: the scan line sweeps over the photo while it is read; it is only for the eye.

const view: StreamingReadingView = {
  photo: { image: new Blob(["x"], { type: "image/jpeg" }), size: { width: 720, height: 900 } },
  rows: [],
  markers: [],
  soFar: 0,
};

describe("StreamingReading scan line", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a line hidden from screen readers over the photo while it is read", async () => {
    render(<StreamingReading view={view} />);
    const line = await screen.findByTestId("pantry-scan-line");
    expect(line).toHaveAttribute("aria-hidden", "true");
    // Moves only with motion; "Minska rörelse" hides it.
    expect(line.innerHTML).toContain("motion-safe:animate-scan-line");
    expect(line.className).toContain("hidden");
    expect(line.className).toContain("overflow-hidden");
  });

  it("shows no line without a photo, and none once the reading is gone (review)", () => {
    const { rerender } = render(<StreamingReading view={{ ...view, photo: null }} />);
    expect(screen.queryByTestId("pantry-scan-line")).toBeNull();
    rerender(<></>);
    expect(screen.queryByTestId("pantry-scan-line")).toBeNull();
  });
});
