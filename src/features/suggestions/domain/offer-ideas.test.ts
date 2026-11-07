import { describe, expect, it } from "vitest";
import { checkOfferIdeas, isOnOffer, type RawOfferIdea } from "./offer-ideas";

// The check that keeps "Nya idéer med erbjudanden" honest: names must be on offer or at home.

const offers = ["Fläskfilé", "broccoli", "falukorv"];
const home = new Set(["ris", "grädde"]);
const atHome = (key: string) => home.has(key);
const homeNames = [...home];
const idea = (overrides: Partial<RawOfferIdea> = {}): RawOfferIdea => ({
  title: "Fläskfilé med broccoli och ris",
  why: "Fläskfilén är billig och riset finns hemma.",
  uses: ["fläskfilé", "broccoli", "ris"],
  ...overrides,
});
const intro = "Fläskfilé och broccoli är billigt i veckan, och du har ris hemma.";

describe("isOnOffer", () => {
  it("matches a whole name, a word of it or the end of a compound", () => {
    expect(isOnOffer("broccoli", offers)).toBe(true);
    expect(isOnOffer("fläskfilé", offers)).toBe(true);
    expect(isOnOffer("korv", offers)).toBe(true);
    expect(isOnOffer("köttfärs", offers)).toBe(false);
    expect(isOnOffer("li", offers)).toBe(false);
    expect(isOnOffer("", offers)).toBe(false);
  });
});

describe("checkOfferIdeas", () => {
  it("keeps dishes whose names are on offer or at home, with the intro and the why", () => {
    const checked = checkOfferIdeas([idea()], intro, offers, atHome, homeNames);
    expect(checked.intro).toBe(intro);
    expect(checked.ideas).toEqual([{ index: 0, why: idea().why, uses: ["fläskfilé", "broccoli", "ris"], missing: [] }]);
  });

  it("moves a name that is neither to missing, and leaves out a dish that misses more than one", () => {
    const checked = checkOfferIdeas(
      [idea({ uses: ["fläskfilé", "ris", "saffran"] }), idea({ title: "Annan rätt med fläskfilé", uses: ["fläskfilé", "saffran", "tryffel"] })],
      intro,
      offers,
      atHome,
      homeNames,
    );
    expect(checked.ideas.map(({ index }) => index)).toEqual([0]);
    expect(checked.ideas[0].missing).toEqual(["saffran"]);
  });

  it("leaves out a dish that uses nothing on offer or at home", () => {
    expect(checkOfferIdeas([idea({ uses: ["saffran"] })], intro, offers, atHome, homeNames)).toEqual({ intro: "", ideas: [] });
  });

  it("leaves out a dish whose title names a main ingredient it does not use, and says so", () => {
    const dropped: string[] = [];
    const checked = checkOfferIdeas([idea({ title: "Köttfärssås med broccoli", uses: ["broccoli", "ris"] })], intro, offers, atHome, homeNames, (reason) =>
      dropped.push(reason),
    );
    expect(checked.ideas).toEqual([]);
    expect(dropped).toEqual(["name"]);
  });

  it("clears a why that names a main ingredient that is not there, and keeps the dish", () => {
    const [kept] = checkOfferIdeas([idea({ why: "Köttfärsen är billig." })], intro, offers, atHome, homeNames).ideas;
    expect(kept.why).toBe("");
  });

  it("clears an intro that names a main ingredient that is neither on offer nor at home", () => {
    expect(checkOfferIdeas([idea()], "Köttfärs är billigt i veckan.", offers, atHome, homeNames).intro).toBe("");
  });

  it("accepts a catalog match of something at home, and keeps each dish's own index", () => {
    const checked = checkOfferIdeas([idea({ uses: ["saffran"] }), idea({ title: "Falukorv med ris", uses: ["falukorv", "ris"] })], intro, offers, atHome, homeNames);
    expect(checked.ideas.map(({ index }) => index)).toEqual([1]);
  });
});
