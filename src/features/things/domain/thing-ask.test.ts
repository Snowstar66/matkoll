import { describe, expect, it } from "vitest";
import { chatInputSchema, cleanHistory, groupHits, maxHistoryTurns, questionSchema, questionWords, refOfGroup } from "./thing-ask";
import type { ThingHit } from "./thing-search";

const hit = (extra: Partial<ThingHit> = {}): ThingHit => ({
  quantity: null,
  id: crypto.randomUUID(),
  name: "Skiftnyckel",
  category: "Verktyg",
  whereHint: null,
  seenOn: 1,
  placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a02",
  siteId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a03",
  siteName: "Hemma",
  room: "Skräpförrådet",
  roomKey: "skräpförrådet",
  part: "Väggen",
  isBox: false,
  photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
  takenAt: "2026-10-31T10:00:00Z",
  written: false,
  noted: false,
  score: 1,
  ...extra,
});

describe("the question", () => {
  it("is cleaned to one line and limited", () => {
    expect(questionSchema.parse("  Har  du\nsett min skiftnyckel? ")).toBe("Har du sett min skiftnyckel?");
    expect(questionSchema.safeParse("   ").success).toBe(false);
    expect(questionSchema.safeParse("x".repeat(301)).success).toBe(false);
  });

  it("has the words worth looking for when the AI gives none", () => {
    expect(questionWords("Har vi något att måla med?")).toEqual(["måla"]);
    expect(questionWords("och tången då?")).toEqual(["tången"]);
  });
});

describe("the chat's input", () => {
  it("keeps the latest turns only", () => {
    const history = Array.from({ length: 10 }, (_, index) => ({ question: `Fråga ${index}`, answer: `Svar ${index}` }));
    const parsed = chatInputSchema.parse({ question: "och tången då?", history });
    expect(parsed.history).toHaveLength(maxHistoryTurns);
    expect(parsed.history[0].question).toBe("Fråga 4");
  });

  it("cleans each turn and cuts the answer, and leaves out a turn without text", () => {
    const clean = (text: string) => text.replace(/\s+/g, " ").trim();
    const cut = (text: string, max: number) => text.slice(0, max);
    expect(
      cleanHistory([{ question: " a\nb ", answer: "x".repeat(400) }, { question: "tom", answer: "  " }], clean, cut),
    ).toEqual([{ question: "a b", answer: "x".repeat(300) }]);
  });
});

describe("the references of an answer", () => {
  it("groups the hits by the card they are on, and the written things by box", () => {
    const a = hit();
    const b = hit({ name: "Blocknyckel" });
    const c = hit({ photoId: null, written: true, isBox: true, part: "Black box", placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a09" });
    const d = hit({ photoId: null, written: true, isBox: true, part: "Black box", placeId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a09", name: "Tång" });
    const groups = groupHits([a, c, b, d]);
    expect(groups.map((group) => group.hits.length)).toEqual([2, 2]);
  });

  it("names the room and part and the card's date, with the thumbnail's card", () => {
    const first = hit();
    // Story 18.7: the card opens big with the first thing the answer is built on marked.
    expect(refOfGroup({ key: "k", hits: [first, hit()] })).toEqual({
      href: `/prylar/kort/0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04?foremal=${first.id}`,
      photoId: "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a04",
      title: "Skräpförrådet · Väggen",
      sub: "Kort från 31 okt",
    });
  });

  it("shows a box with written things without a thumbnail, and opens the box's page", () => {
    const written = hit({ photoId: null, written: true, isBox: true, part: "Black box" });
    expect(refOfGroup({ key: "k", hits: [written] })).toEqual({
      href: `/prylar/lada/${written.placeId}`,
      photoId: null,
      title: "Skräpförrådet · Black box",
      sub: "Låda · Skrivet 31 okt",
    });
  });
});
