import { describe, expect, it } from "vitest";
import {
  moreNotesText,
  noteActionLabel,
  noteInputSchema,
  noteSheetTitle,
  noteText,
  parseNoteActions,
  replySheetTitle,
  splitNotes,
  suggestNoteActions,
  type NoteView,
} from "./note";

const fisksoppa = { id: "11111111-1111-4111-8111-111111111111", title: "Fisksoppa" };
const krämig = { id: "22222222-2222-4222-8222-222222222222", title: "Krämig fisksoppa" };
const tacos = { id: "33333333-3333-4333-8333-333333333333", title: "Tacos" };

describe("suggestNoteActions", () => {
  it("suggests the recipe the text names and Visa listan for shopping (the mockup's note)", () => {
    expect(suggestNoteActions("Sugen på fisksoppa idag, kan du handla?", [tacos, fisksoppa])).toEqual([
      { kind: "plan", recipeId: fisksoppa.id, title: "Fisksoppa" },
      { kind: "list" },
    ]);
  });

  it("matches whole words only, ignoring case and spaces", () => {
    expect(suggestNoteActions("Fisksoppan var god", [fisksoppa])).toEqual([]);
    expect(suggestNoteActions("Gör  FISKSOPPA!", [fisksoppa])).toEqual([{ kind: "plan", recipeId: fisksoppa.id, title: "Fisksoppa" }]);
  });

  it("lets the longest title win where two overlap, and keeps the text's order", () => {
    expect(suggestNoteActions("Tacos i dag och krämig fisksoppa i morgon", [fisksoppa, krämig, tacos]).map((action) => action.kind === "plan" && action.title)).toEqual([
      "Tacos",
      "Krämig fisksoppa",
    ]);
  });

  it("knows the shopping words, and not words that only start like them", () => {
    for (const text of ["Kan du handla?", "Handlar du?", "Köp mjölk", "Kolla listan", "Står på inköpslistan"]) {
      expect(suggestNoteActions(text, []), text).toEqual([{ kind: "list" }]);
    }
    for (const text of ["Köpenhamn i helgen", "Listig plan", ""]) expect(suggestNoteActions(text, []), text).toEqual([]);
  });

  it("gives at most three buttons, two of them recipes", () => {
    const actions = suggestNoteActions("tacos, fisksoppa och pizza, handla", [tacos, fisksoppa, { id: "44444444-4444-4444-8444-444444444444", title: "Pizza" }]);
    expect(actions.filter((action) => action.kind === "plan")).toHaveLength(2);
    expect(actions).toHaveLength(3);
  });
});

describe("texts", () => {
  it("names the buttons", () => {
    expect(noteActionLabel({ kind: "plan", recipeId: fisksoppa.id, title: "Fisksoppa" })).toBe("Lägg Fisksoppa på matsedeln");
    expect(noteActionLabel({ kind: "list" })).toBe("Visa listan");
  });

  it("titles the sheets", () => {
    expect(noteSheetTitle(["Martina"])).toBe("Lapp till Martina");
    expect(noteSheetTitle(["Martina", "Ella"])).toBe("Lapp till hushållet");
    expect(replySheetTitle("Pontus")).toBe("Svar till Pontus");
  });

  it("counts the other notes and puts the mood last", () => {
    expect(moreNotesText(1)).toBe("1 lapp till");
    expect(moreNotesText(2)).toBe("2 lappar till");
    expect(noteText({ text: "Kan du handla?", mood: "love" })).toBe("Kan du handla? 😍");
    expect(noteText({ text: "Kan du handla?", mood: null })).toBe("Kan du handla?");
  });
});

describe("parseNoteActions and the input", () => {
  it("drops anything that is not a list of buttons", () => {
    expect(parseNoteActions([{ kind: "list" }])).toEqual([{ kind: "list" }]);
    expect(parseNoteActions([{ kind: "call" }])).toEqual([]);
    expect(parseNoteActions("x")).toEqual([]);
  });

  it("trims the text and keeps it within 280 characters", () => {
    const base = { mood: null, actions: [], replyTo: null };
    expect(noteInputSchema.parse({ ...base, text: "  Hej  " }).text).toBe("Hej");
    expect(noteInputSchema.safeParse({ ...base, text: "   " }).success).toBe(false);
    expect(noteInputSchema.safeParse({ ...base, text: "a".repeat(281) }).success).toBe(false);
    expect(noteInputSchema.safeParse({ ...base, text: "Hej", mood: "angry" }).success).toBe(false);
  });
});

describe("splitNotes", () => {
  const note = (id: string, mine: boolean): NoteView => ({
    id,
    text: id,
    mood: null,
    actions: [],
    createdAt: "2026-11-01T15:05:00Z",
    mine,
    author: { name: mine ? "Du" : "Pontus", initial: "P", tone: "mint" },
  });

  it("separates the notes from others from the newest own one", () => {
    expect(splitNotes([note("a", true), note("b", false), note("c", true), note("d", false)])).toEqual({
      received: [note("b", false), note("d", false)],
      ownNewest: note("a", true),
    });
  });
});
