import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fail, ok } from "@/lib/errors";

// PhotoSweep (Story 10.3) with the Server Action stubbed: one call per view,
// again while more remain (at most photoSweepMaxRounds), nothing shown for
// any answer, and no more calls in the session after a sweep that removed
// nothing, failed or never answered.

const sweepPlacePhotos = vi.fn();
vi.mock("../actions/sweep-place-photos", () => ({ sweepPlacePhotos: () => sweepPlacePhotos() }));

const { PhotoSweep, photoSweepSkipKey } = await import("./photo-sweep");
const { photoSweepMaxRounds } = await import("../domain/photo-sweep");

beforeEach(() => {
  window.sessionStorage.clear();
  sweepPlacePhotos.mockReset().mockResolvedValue(ok({ removed: 1, more: false }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PhotoSweep", () => {
  it("sweeps once and shows nothing", async () => {
    const { container, rerender } = render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    rerender(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
    expect(window.sessionStorage.getItem(photoSweepSkipKey)).toBeNull();
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
    resolve(ok({ removed: 1, more: false }));
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
  });

  it("sweeps again in the same view while more remain, at most photoSweepMaxRounds times", async () => {
    sweepPlacePhotos.mockResolvedValueOnce(ok({ removed: 100, more: true })).mockResolvedValueOnce(ok({ removed: 20, more: false }));
    render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(2));

    sweepPlacePhotos.mockReset().mockResolvedValue(ok({ removed: 100, more: true }));
    const again = render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(photoSweepMaxRounds));
    again.unmount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sweepPlacePhotos).toHaveBeenCalledTimes(photoSweepMaxRounds);
  });

  it.each([
    ["removed nothing", () => sweepPlacePhotos.mockResolvedValueOnce(ok({ removed: 0, more: false }))],
    ["failed", () => sweepPlacePhotos.mockResolvedValueOnce(fail("pantry_photo_remove_failed"))],
    ["never answered", () => sweepPlacePhotos.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
  ])("shows nothing, and sweeps no more in this session, when the sweep %s", async (_case, answer) => {
    answer();
    const first = render(<PhotoSweep />);
    await waitFor(() => expect(window.sessionStorage.getItem(photoSweepSkipKey)).toBe("1"));
    expect(sweepPlacePhotos).toHaveBeenCalledTimes(1);
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    const second = render(<PhotoSweep />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sweepPlacePhotos).toHaveBeenCalledTimes(1);
    expect(second.container).toBeEmptyDOMElement();
  });

  it("sweeps all the same when sessionStorage cannot be used", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    sweepPlacePhotos.mockResolvedValue(ok({ removed: 0, more: false }));
    render(<PhotoSweep />);
    await waitFor(() => expect(sweepPlacePhotos).toHaveBeenCalledTimes(1));
  });
});
