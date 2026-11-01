import { describe, expect, it } from "vitest";
import {
  changeCountInputSchema,
  changedText,
  changeDateText,
  changeRow,
  confirmText,
  countAnswer,
  countLine,
  countStory,
  countText,
  inlineName,
  setCountInputSchema,
  type ThingChange,
} from "./thing-count";

let next = 0;
const change = (kind: ThingChange["kind"], at: string, quantityAfter: number, delta: number | null = null, cleared: number | null = null): ThingChange => ({
  id: `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  kind,
  delta,
  quantityAfter,
  cleared,
  at,
});

const card12okt = change("card", "2026-10-12T10:00:00Z", 5);
const took1nov = change("take", "2026-11-01T10:00:00Z", 3, -2);
const filled3nov = change("refill", "2026-11-03T10:00:00Z", 5, 2);
const took4nov = change("take", "2026-11-04T10:00:00Z", 3, -2);
const place = "Förrådet · Översta hyllan";

describe("the count of a föremål (Story 18.23)", () => {
  it("says 5 st, and Slut at 0", () => {
    expect(countText(5)).toBe("5 st");
    expect(countText(0)).toBe("Slut");
  });

  it("writes a name with a small first letter in a sentence, unless the second letter is a capital too", () => {
    expect(inlineName("Gravljus")).toBe("gravljus");
    expect(inlineName("Batterier AA")).toBe("batterier AA");
    expect(inlineName("USB-sladdar")).toBe("USB-sladdar");
    expect(inlineName("Ö")).toBe("ö");
    expect(changedText("take", 2, "Gravljus")).toBe("Tog 2 gravljus.");
    expect(changedText("refill", 2, "Gravljus")).toBe("Fyllde på 2 gravljus.");
    expect(confirmText("take", 2)).toBe("Ta 2");
    expect(confirmText("refill", 1)).toBe("Fyll på 1");
  });

  it("reckons from the newest card or written count, with the takes and refills since it, newest first", () => {
    const old = change("take", "2026-10-11T10:00:00Z", 2, -1);
    const story = countStory([old, card12okt, took1nov, filled3nov]);
    expect(story.base).toBe(card12okt);
    expect(story.since).toEqual([filled3nov, took1nov]);
    expect(countStory([took1nov]).base).toBeNull();
  });

  it("answers yes with the count when nothing changed since the card", () => {
    expect(countAnswer("Gravljus", place, 5, [card12okt])).toBe("Ja, 5 gravljus i Förrådet · Översta hyllan.");
  });

  it("says what Livskoll should have and why when it changed: the two latest changes, how many more, and the card", () => {
    expect(countAnswer("Gravljus", place, 3, [card12okt, took1nov])).toBe(
      "Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 togs 1 nov, kortet 12 okt visade 5.",
    );
    expect(countAnswer("Gravljus", place, 3, [card12okt, took1nov, filled3nov, took4nov])).toBe(
      "Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 fylldes på 3 nov, 2 togs 4 nov och 1 ändring till, kortet 12 okt visade 5.",
    );
    const written = change("set", "2026-10-12T10:00:00Z", 5);
    expect(countAnswer("Gravljus", place, 3, [written, took1nov])).toBe("Du borde ha 3 kvar i Förrådet · Översta hyllan. 2 togs 1 nov, du skrev 5 den 12 okt.");
  });

  it("says no and slut at 0, from what was taken since the card, and where they usually are", () => {
    const out = change("take", "2026-11-01T10:00:00Z", 0, -5);
    expect(countAnswer("Glödlampor E27", place, 0, [card12okt, out])).toBe(
      "Nej, glödlampor E27 är slut, enligt det som tagits sedan kortet 12 okt. De brukar ligga i Förrådet · Översta hyllan.",
    );
  });

  it("says it is from the new card the first week after a card that replaced an older count", () => {
    const fresh = change("card", "2026-11-05T10:00:00Z", 4, null, 2);
    expect(countAnswer("Gravljus", place, 4, [fresh], new Date("2026-11-06T10:00:00Z"))).toBe("Ja, 4 gravljus i Förrådet · Översta hyllan, enligt kortet 5 nov.");
    expect(countAnswer("Gravljus", place, 4, [fresh], new Date("2026-11-20T10:00:00Z"))).toBe("Ja, 4 gravljus i Förrådet · Översta hyllan.");
    expect(countLine(4, [fresh], new Date("2026-11-06T10:00:00Z"))).toBe("Räknat på kortet 5 nov. 2 äldre ändringar rensades.");
    expect(countLine(4, [fresh], new Date("2026-11-20T10:00:00Z"))).toBe("Räknat på kortet 5 nov");
  });

  it("gives the sheet's line: drift since the card, the card alone, or a written count", () => {
    expect(countLine(3, [card12okt, took1nov])).toBe("Du borde ha 3 kvar · kortet 12 okt visade 5");
    expect(countLine(5, [card12okt])).toBe("Räknat på kortet 12 okt");
    expect(countLine(4, [change("set", "2026-11-03T10:00:00Z", 4)])).toBe("Du skrev 4 den 3 nov");
    expect(countLine(0, [card12okt, change("take", "2026-11-01T10:00:00Z", 0, -5)])).toBe("Slut enligt det som tagits · kortet 12 okt visade 5");
  });

  it("shows each change as its sign and number, what it was, and the day", () => {
    expect(changeRow(took1nov)).toEqual({ amount: "−2", label: "Tog", plus: false, quiet: false });
    expect(changeRow(filled3nov)).toEqual({ amount: "+2", label: "Fyllde på", plus: true, quiet: false });
    expect(changeRow(card12okt)).toEqual({ amount: "5", label: "Nytt kort", plus: false, quiet: true });
    expect(changeRow(change("set", "2026-11-03T10:00:00Z", 4)).label).toBe("Rättat till");
    expect(changeDateText("2026-11-01T10:00:00Z", new Date("2026-11-01T20:00:00Z"))).toBe("i dag");
    expect(changeDateText("2026-10-12T10:00:00Z", new Date("2026-11-01T20:00:00Z"))).toBe("12 okt");
  });

  it("takes a step of 1 to 999 either way and a count of 0 to 9999", () => {
    const itemId = "0b2f6d0a-3c0e-4d52-9a54-6d0f0c5f6a11";
    expect(changeCountInputSchema.safeParse({ itemId, delta: -2 }).success).toBe(true);
    expect(changeCountInputSchema.safeParse({ itemId, delta: 999 }).success).toBe(true);
    for (const delta of [0, 1000, -1000, 1.5]) expect(changeCountInputSchema.safeParse({ itemId, delta }).success, String(delta)).toBe(false);
    expect(setCountInputSchema.safeParse({ itemId, quantity: 0 }).success).toBe(true);
    expect(setCountInputSchema.safeParse({ itemId, quantity: 10000 }).success).toBe(false);
    expect(setCountInputSchema.safeParse({ itemId: "x", quantity: 1 }).success).toBe(false);
  });
});
