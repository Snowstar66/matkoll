import { describe, expect, it } from "vitest";
import { choicePath, clampTourPage, isLastTourPage, pageAfterSwipe, replayReturnPath, tourPageCount, tourPageLabel } from "./tour";

describe("the welcome tour's pages", () => {
  it("has six pages and keeps an index inside them", () => {
    expect(tourPageCount).toBe(6);
    expect([-1, 0, 3, 5, 6, 99].map(clampTourPage)).toEqual([0, 0, 3, 5, 5, 5]);
  });

  it("names each page for the screen reader", () => {
    expect(tourPageLabel(0)).toBe("Sida 1 av 6");
    expect(tourPageLabel(5)).toBe("Sida 6 av 6");
  });

  it("knows the last page", () => {
    expect(isLastTourPage(4)).toBe(false);
    expect(isLastTourPage(5)).toBe(true);
  });

  it("changes page on a swipe longer than 40 px, never before the first or past the last", () => {
    expect(pageAfterSwipe(2, -41)).toBe(3);
    expect(pageAfterSwipe(2, 41)).toBe(1);
    expect(pageAfterSwipe(2, -40)).toBe(2);
    expect(pageAfterSwipe(0, 120)).toBe(0);
    expect(pageAfterSwipe(5, -120)).toBe(5);
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
  });
});
