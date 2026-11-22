import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { ok } from "@/lib/errors";
import { saveOption } from "@/lib/options";
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
  window.localStorage.clear();
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
  it("is a folded row per done card, newest first, with what it shows, the date and how many; unfolding lists the things, a thing seen on two cards under both", async () => {
    view([card(newer, "2026-11-19T10:00:00Z"), card(older, "2026-11-18T10:00:00Z"), card("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a23", "2026-11-17T10:00:00Z", { status: "reading" })]);
    const groups = await screen.findAllByTestId("room-photo");
    // Only the cards that are read are groups, newest first, all folded.
    expect(groups).toHaveLength(2);
    expect(screen.queryAllByTestId("thing")).toHaveLength(0);
    const first = within(groups[0]).getByTestId("room-photo-toggle");
    expect(first).toHaveTextContent("Hela rummet");
    expect(first).toHaveTextContent("19 nov · 1 sak");
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(first).toHaveAccessibleName("Hela rummet, 19 nov, 1 sak, fäll ut");
    expect(within(groups[1]).getByTestId("room-photo-toggle")).toHaveTextContent("18 nov · 2 saker");
    await userEvent.click(first);
    await userEvent.click(within(groups[1]).getByTestId("room-photo-toggle"));
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(within(groups[0]).getByText("Hammare")).toBeInTheDocument();
    expect(within(groups[1]).getByText("Hammare")).toBeInTheDocument();
    // The photo is a small link to the whole card, and "Öppna kortet" comes last in the unfolded list.
    expect(within(groups[0]).getByTestId("room-photo-thumb")).toHaveAttribute("href", expect.stringContaining(`/prylar/kort/${newer}`));
    expect(within(groups[0]).getByTestId("room-photo-open")).toHaveAttribute("href", expect.stringContaining(`/prylar/kort/${newer}`));
    expect(loadRoomPhotoThings).toHaveBeenCalledWith({ siteId: site, roomKey: "garaget", photoIds: [newer, older] });
  });

  it("says how many föremål have a star on the folded row, and shows the pill on them when unfolded, only with Värdetips on", async () => {
    const vase = thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a15", "Vas", { worth: { why: "Ser ut som Gustavsberg.", confidence: "guess" } });
    loadRoomPhotoThings.mockResolvedValue(ok({ byPhoto: { [older]: [hammer, vase] }, noted: [] }));
    const { unmount } = render(
      <ToastProvider>
        <RoomPhotos siteId={site} roomKey="garaget" cards={[card(older, "2026-11-18T10:00:00Z")]} />
      </ToastProvider>,
    );
    const toggle = await screen.findByTestId("room-photo-toggle");
    expect(screen.queryByTestId("star-count")).not.toBeInTheDocument();
    expect(toggle).toHaveAccessibleName("Hela rummet, 18 nov, 2 saker, fäll ut");
    unmount();
    saveOption("worthLook", true);
    view([card(older, "2026-11-18T10:00:00Z")]);
    const on = await screen.findByTestId("room-photo-toggle");
    expect(screen.getByTestId("star-count")).toHaveTextContent("1");
    expect(on).toHaveAccessibleName("Hela rummet, 18 nov, 2 saker, 1 kan ha värde, fäll ut");
    await userEvent.click(on);
    expect(screen.getAllByTestId("worth-marker")).toHaveLength(1);
    expect(within(screen.getByRole("button", { name: /Vas/ })).getByTestId("worth-marker")).toBeInTheDocument();
  });

  it("says the count at the right of a counted thing and no position", async () => {
    loadRoomPhotoThings.mockResolvedValue(ok({ byPhoto: { [older]: [pump, thing("0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a13", "Spade", { whereHint: "nedre mitten" })] }, noted: [] }));
    view([card(older, "2026-11-18T10:00:00Z")]);
    await userEvent.click(await screen.findByTestId("room-photo-toggle"));
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
