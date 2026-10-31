import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiJob } from "@/lib/ai-job-shape";
import { fail, ok, type Result } from "@/lib/errors";
import { PlaceCapture, type PlaceCaptureProps } from "./place-capture";

const placeId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02";
const cardId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";
const job: AiJob = {
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  kind: "things",
  status: "queued",
  context: { placeId },
  errorCode: null,
  createdAt: "2026-10-31T10:00:00.000Z",
  seen: false,
  ahead: 0,
  count: null,
};

const start = vi.fn<(path: string, body: FormData | Record<string, unknown>, key: string) => Promise<Result<{ job: AiJob }>>>();
const markSeen = vi.fn();
let jobs: AiJob[] = [];
let finishedListener: ((finished: AiJob[]) => void) | null = null;
vi.mock("@/lib/ai-jobs-client", () => ({
  useAiJobs: () => ({ jobs, start, markSeen }),
  useShowingAiResults: () => {},
  useOnAiJobsFinished: (listener: (finished: AiJob[]) => void) => {
    finishedListener = listener;
  },
}));
vi.mock("@/lib/downscale-image", () => ({
  downscaleImage: async () => ok(new Blob(["small"], { type: "image/jpeg" })),
}));
vi.mock("@/components/use-coarse-pointer", () => ({ useCoarsePointer: () => false }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  start.mockReset();
  markSeen.mockReset();
  refresh.mockReset();
  jobs = [];
  finishedListener = null;
});

const props = (overrides: Partial<PlaceCaptureProps> = {}): PlaceCaptureProps => ({ placeId, pending: null, hasCard: false, ...overrides });

function choose(file = new File(["x"], "plats.heic", { type: "image/heic" })) {
  const input = document.querySelectorAll<HTMLInputElement>("input[type=file]")[0];
  fireEvent.change(input, { target: { files: [file] } });
}

describe("Fota en plats", () => {
  it("has the camera button, which takes a new card when the place has one", () => {
    const { rerender } = render(<PlaceCapture {...props()} />);
    expect(screen.getByRole("button", { name: "Fotografera platsen" })).toBeInTheDocument();
    rerender(<PlaceCapture {...props({ hasCard: true })} />);
    expect(screen.getByRole("button", { name: "Ta ett nytt kort" })).toBeInTheDocument();
  });

  it("makes the photo small and posts it as a job with the place and the time, then reads the page again", async () => {
    start.mockResolvedValue(ok({ job }));
    render(<PlaceCapture {...props()} />);
    choose();
    await waitFor(() => expect(start).toHaveBeenCalled());
    const [path, body, key] = start.mock.calls[0];
    expect(path).toBe("/api/things/photo");
    const form = body as FormData;
    expect(form.get("place")).toBe(placeId);
    expect(form.get("image")).toBeInstanceOf(Blob);
    expect(String(form.get("takenAt"))).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says that it looks at the photo while it is sent, and then lets the camera button come back", async () => {
    let answer: (result: Result<{ job: AiJob }>) => void = () => {};
    start.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<PlaceCapture {...props()} />);
    choose();
    expect(await screen.findByText(/Tittar på bilden/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fotografera platsen" })).toBeNull();
    await act(async () => answer(ok({ job })));
    expect(await screen.findByRole("button", { name: "Fotografera platsen" })).toBeInTheDocument();
  });

  it("shows the reason in a notice when the start is refused, and keeps the camera button", async () => {
    start.mockResolvedValue(fail("ai_queue_full"));
    render(<PlaceCapture {...props()} />);
    choose();
    expect(await screen.findByRole("alert")).toHaveTextContent("Det finns redan tre AI-jobb");
    expect(screen.getByRole("button", { name: "Fotografera platsen" })).toBeInTheDocument();
  });

  it("shows a card being read without a camera button, and reads the page again every few seconds", () => {
    vi.useFakeTimers();
    try {
      render(<PlaceCapture {...props({ pending: { id: cardId, status: "reading", errorCode: null } })} />);
      expect(screen.getByText(/Tittar på bilden … Du kan göra annat under tiden/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Fotografera platsen" })).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(3_100));
      expect(refresh).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the page again when this place's job finishes, but not another place's", () => {
    render(<PlaceCapture {...props({ pending: { id: cardId, status: "reading", errorCode: null } })} />);
    act(() => finishedListener?.([{ ...job, status: "done", context: { placeId: "other" } }]));
    expect(refresh).not.toHaveBeenCalled();
    act(() => finishedListener?.([{ ...job, status: "done" }]));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("marks this place's finished jobs as seen", () => {
    jobs = [{ ...job, status: "done" }, { ...job, id: "other", status: "done", context: { placeId: "x" } }, { ...job, id: "active", status: "running" }];
    render(<PlaceCapture {...props()} />);
    expect(markSeen.mock.calls).toEqual([[job.id]]);
  });

  it("keeps a failed card with a calm notice and 'Försök igen', which reads the stored photo again", async () => {
    start.mockResolvedValue(ok({ job }));
    render(<PlaceCapture {...props({ pending: { id: cardId, status: "failed", errorCode: "ai_unavailable" } })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Det ligger kvar, så du kan försöka igen");
    // The camera button is there too: a new card can be taken instead.
    expect(screen.getByRole("button", { name: "Fotografera platsen" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Försök igen" }));
    await waitFor(() => expect(start).toHaveBeenCalledWith("/api/things/retry", { card: cardId }, expect.any(String)));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
