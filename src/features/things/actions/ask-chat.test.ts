import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThingHit } from "../domain/thing-search";

// Story 18.23: "har vi gravljus" is answered by the database, without AI, with
// the count and how it has drifted since the card; a framed question the
// database has nothing for goes to the AI as before.

const searchThingsIn = vi.fn();
const loadChangesIn = vi.fn();
const thingSearchTerms = vi.fn();
const countSitesIn = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/server", () => ({ requireUser: async () => ({ ok: true, data: { id: "u" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/features/settings/server", () => ({
  getAiServiceForUser: async () => ({ thingSearchTerms: (...args: unknown[]) => thingSearchTerms(...args) }),
}));
vi.mock("../data/search", () => ({
  searchThingsIn: (...args: unknown[]) => searchThingsIn(...args),
  loadUnseenIn: async () => [],
  countSitesIn: (...args: unknown[]) => countSitesIn(...args),
}));
vi.mock("../data/count", () => ({ loadChangesIn: (...args: unknown[]) => loadChangesIn(...args) }));
const findCategoryPlaceIn = vi.fn();
vi.mock("../data/noted", () => ({
  findNotedIn: async () => null,
  loadRoomPartsIn: async () => [],
  findCategoryPlaceIn: (...args: unknown[]) => findCategoryPlaceIn(...args),
}));

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
  countSitesIn.mockReset().mockResolvedValue(1);
  findCategoryPlaceIn.mockReset().mockResolvedValue(null);
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

  it("gives no count answer when the rest of the words ask about something the name does not say, and lets the AI have it", async () => {
    searchThingsIn.mockResolvedValue([gravljus]);
    loadChangesIn.mockResolvedValue(new Map([[gravljus.id, []]]));
    await askChat({ question: "har vi gravljus i stugan", history: [] });
    expect(thingSearchTerms).toHaveBeenCalledTimes(1);
    expect(loadChangesIn).not.toHaveBeenCalled();
    searchThingsIn.mockResolvedValue([{ ...gravljus, name: "Batterier AA" }]);
    await askChat({ question: "finns det batterier till fjärrkontrollen", history: [] });
    expect(thingSearchTerms).toHaveBeenCalledTimes(2);
    expect(loadChangesIn).not.toHaveBeenCalled();
  });

  it("names the boende when there is more than one, or when the föremål is in another than the page's", async () => {
    searchThingsIn.mockResolvedValue([{ ...gravljus, quantity: 5, siteName: "Stugan" }]);
    loadChangesIn.mockResolvedValue(new Map([[gravljus.id, [change("card", "2026-10-12T10:00:00Z", 5)]]]));
    countSitesIn.mockResolvedValue(2);
    expect(await askChat({ question: "har vi gravljus", history: [] })).toMatchObject({ data: { answer: "Ja, 5 gravljus i Förrådet · Översta hyllan (Stugan)." } });
    countSitesIn.mockResolvedValue(1);
    expect(await askChat({ question: "har vi gravljus", history: [], siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a99" })).toMatchObject({
      data: { answer: "Ja, 5 gravljus i Förrådet · Översta hyllan (Stugan)." },
    });
    expect(await askChat({ question: "har vi gravljus", history: [], siteId: gravljus.siteId })).toMatchObject({ data: { answer: "Ja, 5 gravljus i Förrådet · Översta hyllan." } });
  });
});

describe("askChat with something bought (Story 18.24)", () => {
  const siteId = gravljus.siteId;
  const refill = (name: string, count: number | null, category = "Hushåll") => ({
    ok: true,
    data: { terms: [name.toLocaleLowerCase("sv")], intent: "refill", remember: null, refill: { name, count, category } },
  });

  it("says where it is and opens Fyll på on the count said, with one AI call", async () => {
    thingSearchTerms.mockResolvedValue(refill("Gravljus", 2));
    searchThingsIn.mockResolvedValue([gravljus]);
    const result = await askChat({ question: "jag har köpt 2 gravljus, var förvarar vi dem?", history: [], siteId });
    expect(result).toEqual({
      ok: true,
      data: { answer: "I Förrådet · Översta hyllan – där finns 3.", refs: [], hits: [gravljus], similar: [], refill: { itemId: gravljus.id, amount: 2 } },
    });
    expect(thingSearchTerms).toHaveBeenCalledTimes(1);
    // Without a count Fyll på opens on 1; a föremål without a count has no Fyll på.
    thingSearchTerms.mockResolvedValue(refill("Gravljus", null));
    expect(await askChat({ question: "jag har köpt gravljus, var förvarar vi dem?", history: [], siteId })).toMatchObject({ data: { refill: { amount: 1 } } });
    searchThingsIn.mockResolvedValue([{ ...gravljus, quantity: null }]);
    const uncounted = await askChat({ question: "jag har köpt gravljus, var förvarar vi dem?", history: [], siteId });
    expect(uncounted).toMatchObject({ data: { answer: "I Förrådet · Översta hyllan." } });
    expect(uncounted.ok && uncounted.data.refill).toBeUndefined();
  });

  it("proposes Kom ihåg where föremål of the same category are, with the count", async () => {
    thingSearchTerms.mockResolvedValue(refill("Batterier", 4, "Elektronik"));
    searchThingsIn.mockResolvedValue([]);
    findCategoryPlaceIn.mockResolvedValue({ room: "Förrådet", part: "Översta hyllan", name: "Glödlampor" });
    const result = await askChat({ question: "jag har köpt 4 batterier, var lägger vi dem?", history: [], siteId });
    expect(findCategoryPlaceIn).toHaveBeenCalledWith({}, siteId, "Elektronik");
    expect(result).toEqual({
      ok: true,
      data: {
        answer: "Inga batterier inskrivna än. Ska de ligga i Förrådet · Översta hyllan, som glödlamporna?",
        refs: [],
        proposal: { name: "Batterier", category: "Elektronik", room: "Förrådet", part: "Översta hyllan", newRoom: false, moves: null, count: 4 },
      },
    });
  });

  it("asks for a room when no föremål of the category is anywhere, and a weak match is not the föremål", async () => {
    thingSearchTerms.mockResolvedValue(refill("Batterier", null, "Elektronik"));
    searchThingsIn.mockResolvedValue([{ ...gravljus, name: "Batterilåda till verktyg" }]);
    expect(await askChat({ question: "jag har köpt batterier, var lägger vi dem?", history: [], siteId })).toMatchObject({
      data: { answer: "Inga batterier inskrivna än. Var ska de ligga?", proposal: { name: "Batterier", room: null, part: null, count: null } },
    });
  });
});
