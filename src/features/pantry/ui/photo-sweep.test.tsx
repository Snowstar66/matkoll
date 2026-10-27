import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// PhotoSweep (Story 10.3) with the Server Action stubbed: one call per view,
// nothing shown for any answer.

const sweepPlacePhotos = vi.fn();
vi.mock("../actions/sweep-place-photos", () => ({ sweepPlacePhotos: () => sweepPlacePhotos() }));

const { PhotoSweep } = await import("./photo-sweep");

beforeEach(() => {
  sweepPlacePhotos.mockReset().mockResolvedValue(ok({ removed: 1 }));
});

describe("PhotoSweep", () => {
  it("sweeps once and shows nothing", async () => {
    const { container, rerender } = render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    rerender(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("sweeps once under StrictMode, which runs the effect twice", async () => {
    let resolve: (value: unknown) => void = () => {};
    sweepPlacePhotos.mockReturnValue(new Promise((done) => (resolve = done)));
    render(
      <StrictMode>
        <PhotoSweep />
      </StrictMode>,
    );
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    resolve(ok({ removed: 0 }));
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
  });

  it("shows nothing when the sweep fails or cannot be reached, and sweeps again in the next view", async () => {
    sweepPlacePhotos.mockResolvedValueOnce(fail("pantry_photo_remove_failed"));
    const first = render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    sweepPlacePhotos.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const second = render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });
});
