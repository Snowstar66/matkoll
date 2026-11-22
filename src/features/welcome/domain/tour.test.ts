import { describe, expect, it } from "vitest";
import { choicePath, clampTourPage, isAreasTourPage, isLastTourPage, pageAfterSwipe, replayReturnPath, tourPageCount, tourPageLabel } from "./tour";

describe("the welcome tour's pages", () => {
  it("has eight pages and keeps an index inside them", () => {
    expect(tourPageCount).toBe(8);
    expect([-1, 0, 3, 5, 6, 99].map(clampTourPage)).toEqual([0, 0, 3, 5, 6, 7]);
  });

  it("names each page for the screen reader", () => {
    expect(tourPageLabel(0)).toBe("Sida 1 av 8");
    expect(tourPageLabel(7)).toBe("Sida 8 av 8");
  });

  it("knows the last page", () => {
    expect(isLastTourPage(6)).toBe(false);
    expect(isLastTourPage(7)).toBe(true);
    expect(isAreasTourPage(6)).toBe(true);
    expect(isAreasTourPage(7)).toBe(false);
  });

  it("changes page on a swipe longer than 40 px, never before the first or past the last", () => {
    expect(pageAfterSwipe(2, -41)).toBe(3);
    expect(pageAfterSwipe(2, 41)).toBe(1);
    expect(pageAfterSwipe(2, -40)).toBe(2);
    expect(pageAfterSwipe(0, 120)).toBe(0);
    expect(pageAfterSwipe(7, -120)).toBe(7);
  });
});

describe("where the tour leads", () => {
  it("closes the replay back to Hjälp only when it came from there", () => {
    expect(replayReturnPath("hjalp")).toBe("/hjalp");
    expect(replayReturnPath(["hjalp", "x"])).toBe("/hjalp");
    expect(replayReturnPath(undefined)).toBe("/recept");
    expect(replayReturnPath("https://example.com")).toBe("/recept");
  });

  it("leads the choices to Recept or to Matvaror's Kyl", () => {
    expect(choicePath("add-recipe")).toBe("/recept");
    expect(choicePath("explore")).toBe("/recept");
    expect(choicePath("photo-fridge")).toBe("/hemma?plats=kyl");
    expect(choicePath("invite")).toBe("/installningar/medlemmar");
    expect(choicePath("privacy")).toBe("/hjalp#konto");
  });
});
