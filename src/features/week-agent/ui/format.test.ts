import { describe, expect, it } from "vitest";
import { allergyInitial, appliedText, cardState, cardTexts, dayDate, joinDays, pluralDays, redoMenuTexts, summaryText } from "./format";

describe("week agent texts", () => {
  it("dates the days of a week", () => {
    expect(dayDate("2026-11-16", 1)).toEqual({ day: 16, month: "nov" });
    expect(dayDate("2026-11-16", 7)).toEqual({ day: 22, month: "nov" });
    expect(dayDate("2026-11-30", 3)).toEqual({ day: 2, month: "dec" });
  });

  it("names a list of days", () => {
    expect(joinDays([4, 1])).toBe("måndag och torsdag");
    expect(joinDays([1, 3, 4])).toBe("måndag, onsdag och torsdag");
    expect(joinDays([2])).toBe("tisdag");
  });

  it("decides what the card is for the week", () => {
    expect(cardState([], [1, 2, 3, 4, 5, 6, 7])).toBe("empty");
    expect(cardState([1, 4], [2, 3, 5, 6, 7])).toBe("partial");
    expect(cardState([1, 2, 3, 4, 5, 6, 7], [])).toBe("full");
    expect(cardState([], [])).toBe("none");
  });

  it("words the card like the sketch", () => {
    expect(cardTexts.emptyBody(47)).toBe("Vecka 47 är tom. Få ett förslag på middagar efter vad du har hemma och vad som är på erbjudande.");
    expect(cardTexts.partialBody(5, [1, 4])).toBe("5 lediga dagar. Dina rätter (måndag och torsdag) ligger kvar som de är.");
    expect(cardTexts.partialBody(6, [2])).toBe("6 lediga dagar. Din rätt (tisdag) ligger kvar som den är.");
    expect(pluralDays(1)).toBe("1 ledig dag");
  });

  it("says what a redo of a full week changes", () => {
    expect(redoMenuTexts(5, 2)).toEqual({ title: "Gör om de olåsta", hint: "Byter 5 rätter. Dina 2 ligger kvar." });
    expect(redoMenuTexts(7, 0).title).toBe("Gör om veckan");
  });

  it("sums up the proposal and the apply", () => {
    expect(summaryText(5, 0, 0)).toBe("5 middagar. Inget är sparat förrän du trycker Använd veckan.");
    expect(summaryText(5, 2, 1)).toBe("5 förslag runt dina 2 rätter och 1 du låst. Inget är sparat förrän du trycker Använd veckan.");
    expect(appliedText(5, 2)).toBe("5 rätter tillagda. Dina 2 låg kvar.");
    expect(appliedText(1, 0)).toBe("1 rätt tillagd.");
  });

  it("takes the letter of an allergy from the person", () => {
    expect(allergyInitial("Kan innehålla laktos (Anna)")).toBe("A");
    expect(allergyInitial("Kan innehålla laktos")).toBe("!");
  });
});
