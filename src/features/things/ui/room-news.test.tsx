import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ok } from "@/lib/errors";
import type { AiJob } from "@/lib/ai-job-shape";
import { RoomMeta, RoomNews } from "./room-news";

// Pontus 1 Nov ("en etta på Förråd men inget nytt"): the room with an unseen
// card says "1 nytt kort", and a reading that failed or whose card is gone is
// marked seen, so the badge never stays with nothing to open.

const markSeen = vi.fn();
let jobs: AiJob[] = [];
vi.mock("@/lib/ai-jobs-client", () => ({ useAiJobs: () => ({ jobs, loaded: true, markSeen }) }));
const locateThingCards = vi.fn();
vi.mock("../actions/locate-cards", () => ({ locateThingCards: (ids: string[]) => locateThingCards(ids) }));

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03";
let next = 0;
const job = (status: AiJob["status"], photoId: string | null, seen = false): AiJob => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  kind: "things",
  status,
  context: photoId ? { placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01", photoId } : {},
  errorCode: null,
  createdAt: "2026-11-01T10:00:00Z",
  seen,
  ahead: 0,
  count: 12,
});

beforeEach(() => {
  markSeen.mockReset();
  locateThingCards.mockReset();
});

function rooms() {
  render(
    <RoomNews siteId={siteId}>
      <p data-testid="boden">
        <RoomMeta roomKey="boden" text="12 föremål · 1 kort" />
      </p>
      <p data-testid="garaget">
        <RoomMeta roomKey="garaget" text="3 föremål" />
      </p>
    </RoomNews>,
  );
}

describe("the rooms' news on the Förråd overview", () => {
  it("says 1 nytt kort with a dot first in the room whose card is unseen, and nothing in the others", async () => {
    const card = job("done", "c0000000-0000-4000-8000-000000000001");
    jobs = [card];
    locateThingCards.mockResolvedValue(ok([{ id: "c0000000-0000-4000-8000-000000000001", siteId, roomKey: "boden" }]));
    rooms();
    expect(await screen.findByTestId("room-news")).toHaveTextContent("1 nytt kort");
    expect(screen.getByTestId("boden")).toHaveTextContent("1 nytt kort · 12 föremål · 1 kort");
    expect(screen.getByTestId("garaget")).toHaveTextContent(/^3 föremål$/);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("marks seen a reading that failed, one without a card, and one whose card is gone", async () => {
    const failed = job("failed", "c0000000-0000-4000-8000-000000000002");
    const cardless = job("done", null);
    const gone = job("done", "c0000000-0000-4000-8000-000000000003");
    jobs = [failed, cardless, gone, job("done", "c0000000-0000-4000-8000-000000000004", true)];
    locateThingCards.mockResolvedValue(ok([]));
    rooms();
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith(gone.id));
    expect(markSeen).toHaveBeenCalledWith(failed.id);
    expect(markSeen).toHaveBeenCalledWith(cardless.id);
    expect(locateThingCards).toHaveBeenCalledWith(["c0000000-0000-4000-8000-000000000003"]);
    expect(screen.queryByTestId("room-news")).not.toBeInTheDocument();
  });

  it("leaves a card in another boende to that boende's rooms", async () => {
    jobs = [job("done", "c0000000-0000-4000-8000-000000000005")];
    locateThingCards.mockResolvedValue(ok([{ id: "c0000000-0000-4000-8000-000000000005", siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a09", roomKey: "boden" }]));
    rooms();
    await waitFor(() => expect(locateThingCards).toHaveBeenCalled());
    expect(screen.queryByTestId("room-news")).not.toBeInTheDocument();
    expect(markSeen).not.toHaveBeenCalled();
  });
});
