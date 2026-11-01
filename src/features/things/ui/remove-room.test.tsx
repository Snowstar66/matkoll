import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import { fail, ok } from "@/lib/errors";
import type { RoomSnapshot } from "../domain/thing-clear";
import { ClearRoom } from "./clear-room";
import { RemoveRoomButton } from "./remove-room";

const removeEmptyThingRoom = vi.fn();
const restoreThingRoom = vi.fn();
vi.mock("../actions/remove-room", () => ({
  removeEmptyThingRoom: (input: unknown) => removeEmptyThingRoom(input),
  restoreThingRoom: (snapshot: unknown) => restoreThingRoom(snapshot),
}));
vi.mock("../actions/clear-things", () => ({ clearThingRoom: vi.fn() }));
vi.mock("../actions/edit-place", () => ({ renameThingRoom: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";
const snapshot: RoomSnapshot = {
  siteId,
  places: [{ id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", room: "Boden", part: null, roomKey: "boden", partKey: "", kind: "part", createdAt: "2026-11-01T07:00:00+00:00" }],
};
const none = { things: 0, cards: 0, boxes: 0 };

beforeEach(() => {
  for (const mock of [removeEmptyThingRoom, restoreThingRoom, replace, refresh]) mock.mockReset();
  removeEmptyThingRoom.mockResolvedValue(ok(snapshot));
  restoreThingRoom.mockResolvedValue(ok(null));
});

describe("Ta bort rummet (Pontus 1 Nov)", () => {
  it("removes an empty room without a question, goes back to Förråd and offers Ångra", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <RemoveRoomButton siteId={siteId} roomKey="boden" room="Boden" />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: "Ta bort rummet" });
    // Muted red, as every Ta bort (Story 16.17, 19.4).
    expect(button).toHaveClass("text-danger");
    await user.click(button);
    expect(removeEmptyThingRoom).toHaveBeenCalledWith({ siteId, roomKey: "boden" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replace).toHaveBeenCalledWith("/prylar");
    const toast = await screen.findByTestId("toast");
    expect(toast).toHaveTextContent("Tog bort Boden.");
    await user.click(within(toast).getByRole("button", { name: "Ångra" }));
    await waitFor(() => expect(restoreThingRoom).toHaveBeenCalledWith(snapshot));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says so when the room is no longer empty, and reads the page again", async () => {
    const user = userEvent.setup();
    removeEmptyThingRoom.mockResolvedValue(fail("things_room_not_empty"));
    render(
      <ToastProvider>
        <RemoveRoomButton siteId={siteId} roomKey="boden" room="Boden" />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Ta bort rummet" }));
    expect(await screen.findByTestId("toast")).toHaveTextContent("Rummet är inte tomt längre. Rensa det i stället.");
    expect(refresh).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("is in the room's ⋯ menu instead of Rensa rummet for an empty room only", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ToastProvider>
        <ClearRoom siteId={siteId} roomKey="boden" room="Boden" counts={none} empty />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fler val" }));
    expect(screen.queryByRole("menuitem", { name: "Rensa rummet" })).toBeNull();
    await user.click(screen.getByRole("menuitem", { name: "Ta bort rummet" }));
    expect(removeEmptyThingRoom).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("toast")).toHaveTextContent("Tog bort Boden.");

    rerender(
      <ToastProvider>
        <ClearRoom siteId={siteId} roomKey="boden" room="Boden" counts={{ things: 2, cards: 1, boxes: 0 }} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Fler val" }));
    expect(screen.queryByRole("menuitem", { name: "Ta bort rummet" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Rensa rummet" })).toBeInTheDocument();
  });
});
