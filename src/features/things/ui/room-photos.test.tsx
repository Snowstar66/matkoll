import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import type { Thing } from "../domain/thing";
import type { RoomCard } from "../domain/thing-room";
import { RoomPhotos } from "./room-photos";

const loadRoomPhotoThings = vi.fn();
vi.mock("../actions/room-things", () => ({ loadRoomPhotoThings: (input: unknown) => loadRoomPhotoThings(input) }));
vi.mock("../actions/thing-item", () => ({ updateThing: vi.fn(), removeThing: vi.fn(), restoreThing: vi.fn() }));
vi.mock("../actions/thing-count", () => ({ loadThingCount: async (itemId: string) => ({ ok: true, data: { itemId, quantity: null, changes: [] } }), setThingCount: vi.fn() }));
vi.mock("../actions/thing-detail", () => ({ loadThingDetail: async () => ({ ok: false, error: { code: "things_unavailable", message: "x" } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const site = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01";
const newer = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a21";
const older = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a22";
const card = (id: string, takenAt: string, over: Partial<RoomCard> = {}): RoomCard => ({
  id,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a31",
  label: "Hela rummet",
  status: "done",
  things: 0,
  takenAt: new Date(takenAt),
  errorCode: null,
  unseenNote: null,
  unseenCount: 0,
  ...over,
});
const thing = (id: string, name: string, over: Partial<Thing> = {}): Thing => ({ id, name, category: "Verktyg", whereHint: null, confidence: "high", seenOn: 1, ...over });
const hammer = thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11", "Hammare");
const pump = thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", "Cykelpump", { quantity: 3 });

beforeEach(() => {
  loadRoomPhotoThings.mockReset();
  loadRoomPhotoThings.mockResolvedValue(ok({ byPhoto: { [newer]: [hammer], [older]: [hammer, pump] }, noted: [] }));
});

function view(cards: RoomCard[]) {
  render(
    <ToastProvider>
      <RoomPhotos siteId={site} roomKey="garaget" cards={cards} />
    </ToastProvider>,
  );
}

describe("the room's things per photo", () => {
  it("is a group per done card with its photo as the heading, and a thing seen on two cards is under both", async () => {
    view([card(newer, "2026-11-19T10:00:00Z"), card(older, "2026-11-18T10:00:00Z"), card("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a23", "2026-11-17T10:00:00Z", { status: "reading" })]);
    const groups = await screen.findAllByTestId("room-photo");
    // Only the cards that are read are groups, newest first.
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByRole("heading")).toHaveTextContent("Foto 19 nov");
    expect(within(groups[0]).getByRole("heading")).toHaveTextContent("Hela rummet · 1 sak");
    expect(within(groups[1]).getByRole("heading")).toHaveTextContent("Foto 18 nov");
    expect(within(groups[1]).getByRole("heading")).toHaveTextContent("2 saker");
    expect(within(groups[0]).getByText("Hammare")).toBeInTheDocument();
    expect(within(groups[1]).getByText("Hammare")).toBeInTheDocument();
    // The photo is a small link to the whole card.
    expect(within(groups[0]).getByTestId("room-photo-thumb")).toHaveAttribute("href", expect.stringContaining(`/prylar/kort/${newer}`));
    expect(loadRoomPhotoThings).toHaveBeenCalledWith({ siteId: site, roomKey: "garaget", photoIds: [newer, older] });
  });

  it("says the count at the right of a counted thing and no position", async () => {
    loadRoomPhotoThings.mockResolvedValue(ok({ byPhoto: { [older]: [pump, thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a13", "Spade", { whereHint: "nedre mitten" })] }, noted: [] }));
    view([card(older, "2026-11-18T10:00:00Z")]);
    const rows = await screen.findAllByTestId("thing");
    expect(rows[0]).toHaveTextContent("Cykelpump3 st");
    expect(rows[1]).toHaveTextContent("Spade");
    expect(rows[1]).not.toHaveTextContent("nedre mitten");
  });

  it("lists things written in without a card last", async () => {
    loadRoomPhotoThings.mockResolvedValue(ok({ byPhoto: { [older]: [hammer] }, noted: [thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a14", "Pass", { whereHint: "skrivet 31 okt", noted: { at: "2026-10-31T21:00:00.000Z", part: null } })] }));
    view([card(older, "2026-11-18T10:00:00Z")]);
    const noted = await screen.findByTestId("room-photo-noted");
    expect(within(noted).getByText("Pass")).toBeInTheDocument();
  });
});
