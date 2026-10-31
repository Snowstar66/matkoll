import { describe, expect, it } from "vitest";
import { clearCountsText, clearedText, clearInputSchema, matchesClearWord } from "./thing-clear";
import { updateThingInputSchema } from "./thing-edit";

const id = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";

describe("what a clearing says", () => {
  it("counts things, cards and boxes, and leaves out what is zero", () => {
    expect(clearCountsText({ things: 74, cards: 9, boxes: 2 })).toBe("74 prylar, 9 kort, 2 lådor");
    expect(clearCountsText({ things: 1, cards: 0, boxes: 1 })).toBe("1 pryl, 1 låda");
    expect(clearCountsText({ things: 0, cards: 0, boxes: 0 })).toBe("Inget");
    expect(clearedText({ things: 0, cards: 0, boxes: 0 })).toBe("Det fanns inget att rensa.");
    expect(clearedText({ things: 3, cards: 1, boxes: 0 })).toBe("Rensade 3 prylar, 1 kort.");
  });

  it("accepts the word without regard to case and the spaces at its ends, and nothing else", () => {
    expect(matchesClearWord("  skräpförrådet ", "Skräpförrådet")).toBe(true);
    expect(matchesClearWord("RENSA", "RENSA")).toBe(true);
    expect(matchesClearWord("rensa", "RENSA")).toBe(true);
    expect(matchesClearWord("Skräpförråd", "Skräpförrådet")).toBe(false);
    expect(matchesClearWord("", "RENSA")).toBe(false);
    expect(matchesClearWord("anything", "")).toBe(false);
  });

  it("wants a boende, a confirmation of at most 100 characters and, for a room, its key", () => {
    expect(clearInputSchema.safeParse({ siteId: id }).success).toBe(false);
    expect(clearInputSchema.safeParse({ siteId: id, confirm: "x".repeat(101) }).success).toBe(false);
    expect(clearInputSchema.safeParse({ siteId: id, confirm: "RENSA" }).success).toBe(true);
    expect(clearInputSchema.safeParse({ siteId: id, roomKey: "skräpförrådet", confirm: "x" }).success).toBe(true);
    expect(clearInputSchema.safeParse({ siteId: "x", confirm: "x" }).success).toBe(false);
    expect(clearInputSchema.safeParse({ siteId: id, roomKey: "", confirm: "x" }).success).toBe(false);
  });
});

describe("the update of a thing", () => {
  it("cleans the name and the where, and an empty where is cleared", () => {
    const parsed = updateThingInputSchema.parse({ id, name: "  Hammare ", category: "Verktyg", whereHint: "  översta   hyllan " });
    expect(parsed).toMatchObject({ name: "Hammare", whereHint: "översta hyllan" });
    expect(updateThingInputSchema.parse({ id, name: "Hammare", category: "Verktyg", whereHint: "  " }).whereHint).toBeNull();
  });

  it("refuses an unknown category, an empty name and a where that is too long", () => {
    expect(updateThingInputSchema.safeParse({ id, name: "Hammare", category: "Mat", whereHint: null }).success).toBe(false);
    expect(updateThingInputSchema.safeParse({ id, name: " ", category: "Verktyg", whereHint: null }).success).toBe(false);
    expect(updateThingInputSchema.safeParse({ id, name: "Hammare", category: "Verktyg", whereHint: "x".repeat(121) }).success).toBe(false);
  });
});
