import { beforeEach, describe, expect, it, vi } from "vitest";

const clearThingsIn = vi.fn();
const loadRoomIn = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "u" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/revalidate", () => ({ revalidateFor: vi.fn() }));
vi.mock("../data/clear", () => ({ clearThingsIn: (...args: unknown[]) => clearThingsIn(...args) }));
vi.mock("../data/rooms", () => ({ loadRoomIn: (...args: unknown[]) => loadRoomIn(...args) }));
const loadSiteCardFilesIn = vi.fn();
const removeCardFiles = vi.fn();
vi.mock("../data/photos", async (importOriginal) => ({
  formerMembersFiles: (await importOriginal<typeof import("../data/photos")>()).formerMembersFiles,
  loadMemberIdsIn: async () => ["u", "m"],
  loadSiteCardFilesIn: (...args: unknown[]) => loadSiteCardFilesIn(...args),
  removeCardFiles: (...args: unknown[]) => removeCardFiles(...args),
}));
vi.mock("./sweep-card-files", () => ({ sweepCardFilesIn: async () => 0 }));

import { clearThingRoom, clearThingSite } from "./clear-things";

const siteId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";

beforeEach(() => {
  loadSiteCardFilesIn.mockReset().mockResolvedValue([]);
  removeCardFiles.mockReset().mockResolvedValue({ failed: null });
  clearThingsIn.mockReset().mockResolvedValue({ kind: "cleared", counts: { things: 1, cards: 1, boxes: 0 }, paths: [] });
  loadRoomIn.mockReset().mockResolvedValue({ room: "Skräpförrådet", key: "skräpförrådet" });
});

describe("the clearing checks the confirmation on the server", () => {
  it("removes nothing for a room when the name is wrong or missing", async () => {
    for (const confirm of ["", "Skräpförråd", "RENSA", undefined as unknown as string]) {
      const result = await clearThingRoom({ siteId, roomKey: "skräpförrådet", confirm });
      expect(result.ok).toBe(false);
    }
    expect(clearThingsIn).not.toHaveBeenCalled();
  });

  it("removes the room when the real name is typed, whatever the case and spaces", async () => {
    const result = await clearThingRoom({ siteId, roomKey: "skräpförrådet", confirm: "  skräpFÖRRÅDET " });
    expect(result.ok).toBe(true);
    expect(clearThingsIn).toHaveBeenCalledTimes(1);
  });

  it("says the room is gone, and removes nothing, when it does not exist", async () => {
    loadRoomIn.mockResolvedValue(null);
    expect((await clearThingRoom({ siteId, roomKey: "x", confirm: "x" })).ok).toBe(false);
    expect(clearThingsIn).not.toHaveBeenCalled();
  });

  it("removes a boende's Förråd only for RENSA", async () => {
    for (const confirm of ["", "rensa nu", "Hemma", undefined as unknown as string]) {
      expect((await clearThingSite({ siteId, confirm })).ok).toBe(false);
    }
    expect(clearThingsIn).not.toHaveBeenCalled();
    expect((await clearThingSite({ siteId, confirm: " rensa " })).ok).toBe(true);
    expect(clearThingsIn).toHaveBeenCalledTimes(1);
  });
});

// Story 21.2b: the files of every member go, and those of a member who has left go before the rows.
describe("the clearing removes the household's files", () => {
  it("lists every member's folders, removes a former member's files first and the members' after", async () => {
    loadSiteCardFilesIn.mockResolvedValue(["u/p/1.jpg", "m/p/2.jpg", "gone/p/3.jpg"]);
    clearThingsIn.mockResolvedValue({ kind: "cleared", counts: { things: 3, cards: 3, boxes: 0 }, paths: ["m/p/4.jpg"] });
    expect((await clearThingSite({ siteId, confirm: "RENSA" })).ok).toBe(true);
    expect(loadSiteCardFilesIn).toHaveBeenCalledWith(expect.anything(), ["u", "m"], siteId, undefined);
    expect(removeCardFiles.mock.calls.map((call) => call[1])).toEqual([["gone/p/3.jpg"], ["u/p/1.jpg", "m/p/2.jpg", "m/p/4.jpg"]]);
    expect(removeCardFiles.mock.invocationCallOrder[0]).toBeLessThan(clearThingsIn.mock.invocationCallOrder[0]);
  });
});
