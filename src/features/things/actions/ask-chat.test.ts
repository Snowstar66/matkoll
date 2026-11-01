import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThingHit } from "../domain/thing-search";

// Story 18.23: "har vi gravljus" is answered by the database, without AI, with
// the count and how it has drifted since the card; a framed question the
// database has nothing for goes to the AI as before.

const searchThingsIn = vi.fn();
const loadChangesIn = vi.fn();
const thingSearchTerms = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "u" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/settings/server", () => ({
  getAiServiceForUser: async () => ({ thingSearchTerms: (...args: unknown[]) => thingSearchTerms(...args) }),
}));
vi.mock("../data/search", () => ({
  searchThingsIn: (...args: unknown[]) => searchThingsIn(...args),
  loadUnseenIn: async () => [],
}));
vi.mock("../data/count", () => ({ loadChangesIn: (...args: unknown[]) => loadChangesIn(...args) }));
vi.mock("../data/noted", () => ({ findNotedIn: vi.fn(), loadRoomPartsIn: async () => [] }));

const { askChat } = await import("./ask-chat");

const gravljus: ThingHit = {
  id: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11",
  name: "Gravljus",
  category: "Hushåll",
  whereHint: null,
  seenOn: 1,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a01",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Förrådet",
  roomKey: "förrådet",
  part: "Översta hyllan",
  isBox: false,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  takenAt: "2026-10-12T10:00:00Z",
  written: false,
  noted: false,
  score: 1,
  quantity: 3,
};

const change = (kind: string, at: string, quantityAfter: number, delta: number | null = null) => ({ id: crypto.randomUUID(), kind, delta, quantityAfter, cleared: null, at });

beforeEach(() => {
  searchThingsIn.mockReset();
  loadChangesIn.mockReset();
  thingSearchTerms.mockReset().mockResolvedValue({ ok: false, error: { code: "ai_unavailable", message: "" } });
});

describe("askChat with a count (Story 18.23)", () => {
  it("answers har vi gravljus from the database, without AI, with the drift since the card", async () => {
    searchThingsIn.mockResolvedValue([gravljus]);
    loadChangesIn.mockResolvedValue(new Map([[gravljus.id, [change("take", "2026-11-01T10:00:00Z", 3, -2), change("card", "2026-10-12T10:00:00Z", 5)]]]));
    const result = await askChat({ question: "har vi gravljus hemma?", history: [] });
    expect(result).toMatchObject({
      ok: true,
      data: { answer: "Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 togs 1 nov, kortet 12 okt visade 5.", hits: [gravljus] },
    });
    expect(searchThingsIn).toHaveBeenCalledWith({}, ["gravljus"], expect.any(Number));
    expect(thingSearchTerms).not.toHaveBeenCalled();
  });

  it("says Ja with the count when nothing changed, and as today for a föremål without a count", async () => {
    searchThingsIn.mockResolvedValue([{ ...gravljus, quantity: 5 }]);
    loadChangesIn.mockResolvedValue(new Map([[gravljus.id, [change("card", "2026-10-12T10:00:00Z", 5)]]]));
    expect(await askChat({ question: "har vi gravljus", history: [] })).toMatchObject({ data: { answer: "Ja, 5 gravljus i Förrådet · Översta hyllan." } });
    searchThingsIn.mockResolvedValue([{ ...gravljus, quantity: null }]);
    expect(await askChat({ question: "var är gravljusen", history: [] })).toMatchObject({ data: { answer: "Gravljus finns i Förrådet · Översta hyllan." } });
    expect(thingSearchTerms).not.toHaveBeenCalled();
  });

  it("lets the AI have a framed question the database has no answer to, since it knows other words", async () => {
    // Only a close match (a typo or the category): nothing that answers.
    searchThingsIn.mockResolvedValue([{ ...gravljus, name: "Tändare" }]);
    await askChat({ question: "har vi tändstickor", history: [] });
    expect(thingSearchTerms).toHaveBeenCalled();
  });
});
