import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import { resetDeviceStore } from "./device-store";
import { QuickCamera } from "./quick-camera";
import { TakeCard } from "./take-card";

const ensureCapturePlace = vi.fn();
vi.mock("../actions/capture-place", () => ({ ensureCapturePlace: (input: unknown) => ensureCapturePlace(input) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
const send = vi.fn();
vi.mock("./use-card-upload", () => ({
  useCardUpload: () => ({ state: { kind: "idle" }, send: (files: File[], target: unknown) => send(files, target), clear: vi.fn(), setState: vi.fn() }),
}));
vi.mock("@/lib/ai-jobs-client", () => ({ useShowingAiResults: () => {}, useOnAiJobsFinished: () => {} }));

const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const place = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";

// A fake camera: a stream whose one track can be stopped, and a canvas that gives a JPEG.
let trackStop = vi.fn();
const getUserMedia = vi.fn();
let thumbs = 0;

function fakeStream(): MediaStream {
  trackStop = vi.fn();
  return { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
}

beforeEach(() => {
  window.localStorage.clear();
  resetDeviceStore();
  ensureCapturePlace.mockReset();
  send.mockReset();
  getUserMedia.mockReset();
  getUserMedia.mockImplementation(async () => fakeStream());
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 4032 });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 3024 });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback: BlobCallback) => callback(new Blob(["jpeg"], { type: "image/jpeg" })));
  thumbs = 0;
  URL.createObjectURL = vi.fn(() => `blob:thumb-${++thumbs}`);
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openCamera(props: Partial<Parameters<typeof QuickCamera>[0]> = {}) {
  const handlers = { onCancel: vi.fn(), onDone: vi.fn(), onFallback: vi.fn(), ...props };
  render(<QuickCamera room="Garaget" {...handlers} />);
  await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
  // The stream is shown: the shutter wakes when the video knows its size.
  await act(async () => {});
  fireEvent.loadedMetadata(screen.getByTestId("quick-camera-video"));
  return handlers;
}

const shutter = () => screen.getByRole("button", { name: "Ta kort" });

describe("Snabbkamera", () => {
  it("asks for the back camera and shows the room and the count", async () => {
    await openCamera();
    expect(getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: "environment" }) }));
    expect(screen.getByRole("dialog", { name: "Snabbkamera, Garaget" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Garaget" })).toBeInTheDocument();
    expect(screen.getByTestId("quick-camera-count")).toHaveTextContent("0 kort");
    expect(screen.getByTestId("quick-camera-done")).toBeDisabled();
  });

  it("adds a shot per tap, drops one with ×, and Klar sends the rest in order and stops the camera", async () => {
    const { onDone } = await openCamera();
    await userEvent.click(shutter());
    await userEvent.click(shutter());
    await userEvent.click(shutter());
    expect(screen.getByTestId("quick-camera-count")).toHaveTextContent("3 kort");
    expect(screen.getAllByRole("img")).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Ta bort kort 2" }));
    expect(screen.getByTestId("quick-camera-count")).toHaveTextContent("2 kort");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumb-2");
    await userEvent.click(screen.getByRole("button", { name: "Klar, skicka 2 kort" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const photos = vi.mocked(onDone).mock.calls[0][0] as File[];
    expect(photos).toHaveLength(2);
    expect(photos.every((photo) => photo instanceof File && photo.type === "image/jpeg")).toBe(true);
    expect(trackStop).toHaveBeenCalled();
  });

  it("stops the camera on Avbryt", async () => {
    const { onCancel, onDone } = await openCamera();
    await userEvent.click(shutter());
    await userEvent.click(screen.getByRole("button", { name: "Avbryt" }));
    expect(trackStop).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("stops the camera while the page is hidden and starts it again when it shows", async () => {
    await openCamera();
    const first = trackStop;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(first).toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it("stops the camera when it closes", async () => {
    getUserMedia.mockImplementation(async () => fakeStream());
    const handlers = { onCancel: vi.fn(), onDone: vi.fn(), onFallback: vi.fn() };
    const { unmount } = render(<QuickCamera room="Garaget" {...handlers} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => {});
    unmount();
    expect(trackStop).toHaveBeenCalled();
  });

  it("says calmly when the camera is not allowed, and offers Ta foto", async () => {
    getUserMedia.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const onFallback = vi.fn();
    render(<QuickCamera room="Garaget" onCancel={vi.fn()} onDone={vi.fn()} onFallback={onFallback} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Kameran är inte tillåten");
    await userEvent.click(screen.getByRole("button", { name: "Använd Ta foto" }));
    expect(onFallback).toHaveBeenCalled();
  });

  it("says there is no camera where the browser has none", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    render(<QuickCamera room="Garaget" onCancel={vi.fn()} onDone={vi.fn()} onFallback={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Hittar ingen kamera här");
  });
});

describe("Snabbkamera on a room's page", () => {
  it("sends the shots as cards of the page's room, one call in order", async () => {
    ensureCapturePlace.mockResolvedValue(ok({ placeId: place }));
    send.mockResolvedValue(2);
    render(<TakeCard siteId={site} rooms={["Garaget"]} defaultRoom="Garaget" variant="default" layout="room" title="Ta fler kort" />);
    await userEvent.click(screen.getByRole("button", { name: /Snabbkamera/ }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.loadedMetadata(screen.getByTestId("quick-camera-video"));
    await userEvent.click(shutter());
    await userEvent.click(shutter());
    await userEvent.click(screen.getByRole("button", { name: "Klar, skicka 2 kort" }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const [files, target] = send.mock.calls[0] as [File[], unknown];
    expect(files).toHaveLength(2);
    expect(target).toEqual({ placeId: place });
    expect(ensureCapturePlace).toHaveBeenCalledWith({ siteId: site, room: "Garaget", part: "", box: false });
    expect(screen.queryByTestId("quick-camera")).toBeNull();
    expect(trackStop).toHaveBeenCalled();
  });
});
