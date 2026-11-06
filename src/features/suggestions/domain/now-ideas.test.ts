import { describe, expect, it } from "vitest";
import { checkNowIdeas, nameMentionsOther, namesToCheck, nowIdeasResultSchema, type RawNowIdea } from "./now-ideas";

// The check that keeps the friendly answer honest (Story 25.4).

const home = new Set(["dressing", "ketchup", "senap", "tabasco"]);
const atHome = (key: string) => home.has(key);
const idea = (overrides: Partial<RawNowIdea> = {}): RawNowIdea => ({
  name: "Burgersås",
  how: "dressing + ketchup och lite senap",
  why: "Använder det som legat längst.",
  kind: "sås",
  uses: ["dressing", "ketchup", "senap"],
  missing: [],
  ...overrides,
});

describe("checkNowIdeas", () => {
  it("keeps an idea whose names are all at home as it is", () => {
    expect(checkNowIdeas([idea()], atHome)).toEqual([idea()]);
  });

  it("matches names regardless of case and spaces", () => {
    const [kept] = checkNowIdeas([idea({ uses: ["Dressing ", "KETCHUP"] })], atHome);
    expect(kept.uses).toEqual(["Dressing ", "KETCHUP"]);
    expect(kept.missing).toEqual([]);
  });

  it("moves a name in uses that is not at home to missing", () => {
    const [kept] = checkNowIdeas([idea({ uses: ["dressing", "chilisås"] })], atHome);
    expect(kept.uses).toEqual(["dressing"]);
    expect(kept.missing).toEqual(["chilisås"]);
  });

  it("moves a name in missing that is at home to uses", () => {
    const [kept] = checkNowIdeas([idea({ uses: ["dressing"], missing: ["senap"] })], atHome);
    expect(kept.uses).toEqual(["dressing", "senap"]);
    expect(kept.missing).toEqual([]);
  });

  it("leaves out an idea that misses more than one thing", () => {
    const kept = checkNowIdeas([idea({ uses: ["dressing", "chilisås"], missing: ["tryffel"] }), idea({ name: "Dipp" })], atHome);
    expect(kept.map(({ name }) => name)).toEqual(["Dipp"]);
  });

  it("counts a name once, however often it is given", () => {
    const [kept] = checkNowIdeas([idea({ uses: ["dressing"], missing: ["chilisås", "Chilisås"] })], atHome);
    expect(kept.missing).toEqual(["Chilisås"]);
  });

  it("leaves out an idea that uses nothing that is at home", () => {
    expect(checkNowIdeas([idea({ uses: ["tryffel"] })], atHome)).toEqual([]);
  });

  it("takes salt, pepper, oil and water as at home without listing them", () => {
    const [kept] = checkNowIdeas([idea({ uses: ["dressing", "salt", "Olja"], missing: ["vatten"] })], atHome);
    expect(kept.uses).toEqual(["dressing"]);
    expect(kept.missing).toEqual([]);
  });
});

describe("namesToCheck", () => {
  it("lists each name of uses and missing once, normalized, without salt, pepper, oil and water", () => {
    expect(namesToCheck([idea({ uses: ["Dressing", "salt"], missing: ["Chilisås"] }), idea({ uses: ["dressing "] })])).toEqual(["dressing", "chilisås"]);
  });
});

describe("nowIdeasResultSchema", () => {
  it("takes the intro and one to four ideas, each with at most one missing", () => {
    const ok = { intro: "Det är tunt, men det här går:", ideas: [idea()], siteId: null };
    expect(nowIdeasResultSchema.safeParse(ok).success).toBe(true);
    expect(nowIdeasResultSchema.safeParse({ ...ok, ideas: [] }).success).toBe(false);
    // An older result without a why still reads, with an empty one.
    const withoutWhy = { ...idea(), why: undefined };
    expect(nowIdeasResultSchema.parse({ ...ok, ideas: [withoutWhy] }).ideas[0].why).toBe("");
    expect(nowIdeasResultSchema.safeParse({ ...ok, ideas: [idea({ missing: ["a", "b"] })] }).success).toBe(false);
    expect(nowIdeasResultSchema.safeParse({ ...ok, ideas: [idea({ kind: "efterrätt" as never })] }).success).toBe(false);
  });
});

describe("the name guard", () => {
  const pantry = new Set(["falukorv", "krossade tomater", "spagetti"]);
  const homeNames = [...pantry];
  const spagetti = (name: string): RawNowIdea => ({ name, how: "bra", kind: "rätt", uses: ["falukorv", "krossade tomater", "spagetti"], missing: [] });

  it("drops Spagetti och köttfärssås when the idea uses korv and no köttfärs is at home", () => {
    const dropped: string[] = [];
    const kept = checkNowIdeas([spagetti("Spagetti och köttfärssås")], (key) => pantry.has(key), homeNames, (reason) => dropped.push(reason));
    expect(kept).toEqual([]);
    expect(dropped).toEqual(["name"]);
  });

  it("keeps Spagetti med korvsås", () => {
    expect(checkNowIdeas([spagetti("Spagetti med korvsås")], (key) => pantry.has(key), homeNames).map(({ name }) => name)).toEqual(["Spagetti med korvsås"]);
  });

  it("keeps a name whose main ingredient is at home, or listed as the one thing missing", () => {
    expect(nameMentionsOther("Köttfärssås", ["spagetti"], ["köttfärs"])).toBe(false);
    expect(nameMentionsOther("Kycklinggryta", ["ris"], [])).toBe(true);
    expect(nameMentionsOther("Kycklinggryta", ["ris", "kyckling"], [])).toBe(false);
  });

  it("sees compounds and inflections, and not words that only start alike", () => {
    expect(nameMentionsOther("Laxpasta", ["pasta"], [])).toBe(true);
    expect(nameMentionsOther("Räksmörgås", ["bröd"], [])).toBe(true);
    expect(nameMentionsOther("Ägg på burk", ["bröd"], [])).toBe(true);
    expect(nameMentionsOther("Färsk potatis med smör", ["potatis", "smör"], [])).toBe(false);
    expect(nameMentionsOther("Äggplanta med ost", ["ost"], [])).toBe(false);
    expect(nameMentionsOther("Fiskpinnar", ["fiskpinnar"], [])).toBe(false);
  });
});
