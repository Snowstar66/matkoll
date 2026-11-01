import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThingsDataError } from "../data/client";
import type { RoomSnapshot } from "../domain/thing-clear";

const removeEmptyRoomIn = vi.fn();
const restoreRoomIn = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "u" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("../data/room-remove", () => ({
  removeEmptyRoomIn: (...args: unknown[]) => removeEmptyRoomIn(...args),
  restoreRoomIn: (...args: unknown[]) => restoreRoomIn(...args),
}));

import { removeEmptyThingRoom, restoreThingRoom } from "./remove-room";

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";
const snapshot: RoomSnapshot = {
  siteId,
  places: [{ id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a12", room: "Boden", part: null, roomKey: "boden", partKey: "", kind: "part", createdAt: "2026-11-01T07:00:00+00:00" }],
};

beforeEach(() => {
  removeEmptyRoomIn.mockReset().mockResolvedValue({ kind: "removed", snapshot });
  restoreRoomIn.mockReset().mockResolvedValue("restored");
});

describe("removeEmptyThingRoom", () => {
  it("removes an empty room and gives it back for Ångra", async () => {
    expect(await removeEmptyThingRoom({ siteId, roomKey: "boden" })).toEqual({ ok: true, data: snapshot });
    expect(removeEmptyRoomIn).toHaveBeenCalledWith({}, siteId, "boden");
  });

  it("says a room with something in it is not empty, and one that went is gone", async () => {
    removeEmptyRoomIn.mockResolvedValueOnce({ kind: "not_empty" });
    expect(await removeEmptyThingRoom({ siteId, roomKey: "boden" })).toMatchObject({ ok: false, error: { code: "things_room_not_empty" } });
    removeEmptyRoomIn.mockResolvedValueOnce({ kind: "gone" });
    expect(await removeEmptyThingRoom({ siteId, roomKey: "boden" })).toMatchObject({ ok: false, error: { code: "things_place_gone" } });
    removeEmptyRoomIn.mockRejectedValueOnce(new ThingsDataError("remove_failed 42501"));
    expect(await removeEmptyThingRoom({ siteId, roomKey: "boden" })).toMatchObject({ ok: false, error: { code: "things_place_remove_failed" } });
  });

  it("refuses a bad input without touching the database", async () => {
    for (const input of [{ siteId: "x", roomKey: "boden" }, { siteId, roomKey: "" }, null]) {
      expect((await removeEmptyThingRoom(input as never)).ok).toBe(false);
    }
    expect(removeEmptyRoomIn).not.toHaveBeenCalled();
  });
});

describe("restoreThingRoom", () => {
  it("brings the room back, and says when a room of that name was made since or the boende went", async () => {
    expect(await restoreThingRoom(snapshot)).toEqual({ ok: true, data: null });
    restoreRoomIn.mockResolvedValueOnce("taken");
    expect(await restoreThingRoom(snapshot)).toMatchObject({ ok: false, error: { code: "things_room_taken" } });
    restoreRoomIn.mockResolvedValueOnce("site_gone");
    expect(await restoreThingRoom(snapshot)).toMatchObject({ ok: false, error: { code: "things_place_gone" } });
    restoreRoomIn.mockRejectedValueOnce(new ThingsDataError("restore_failed 42501"));
    expect(await restoreThingRoom(snapshot)).toMatchObject({ ok: false, error: { code: "things_restore_failed" } });
  });

  it("refuses a snapshot whose places are not one room under its own key", async () => {
    const forged = { ...snapshot, places: [{ ...snapshot.places[0]!, roomKey: "garaget" }] };
    expect((await restoreThingRoom(forged)).ok).toBe(false);
    expect(restoreRoomIn).not.toHaveBeenCalled();
  });
});
