import { describe, expect, it } from "vitest";
import { anna, bo, id, input, library, recipe, settings, weekStart } from "./fixtures";
import { buildShortlist, maxShortlist, scoreCandidate } from "./shortlist";

const ctx = (extra = {}) => {
  const { candidates: _c, ...rest } = input([], extra);
  void _c;
  return rest;
};

describe("buildShortlist", () => {
  it("excludes dishes with a household allergen, by name (hard rule)", () => {
    const pool = library();
    const out = buildShortlist(pool, ctx({ people: [anna] }));
    const titles = out.candidates.map((c) => c.title);
    expect(titles).not.toContain("Kycklinggryta");
    expect(titles).not.toContain("Fiskgratäng");
    expect(titles).not.toContain("Pannkakor");
    expect(out.excludedForAllergy.map((e) => e.title).sort()).toEqual(["Fiskgratäng", "Korvstroganoff", "Kycklinggryta", "Pannkakor"].sort());
    expect(out.excludedForAllergy.find((e) => e.title === "Kycklinggryta")?.allergens).toEqual(["laktos"]);
  });

  it("treats a dish without ingredient lines as unsafe when anyone has an allergy, and fine otherwise", () => {
    const bare = recipe("Mysterierätt", []);
    expect(buildShortlist([bare], ctx({ people: [anna] })).excludedForAllergy).toHaveLength(1);
    expect(buildShortlist([bare], ctx({ people: [bo] })).candidates).toHaveLength(1);
  });

  it("leaves out dishes already fixed on the week and duplicates", () => {
    const pool = library();
    const dup = [...pool, pool[0]];
    const out = buildShortlist(dup, ctx({ fixedDays: [{ dayIndex: 4, recipeId: pool[1].id, title: "Kycklinggryta", ingredients: [] }] }));
    expect(out.candidates.map((c) => c.id)).not.toContain(pool[1].id);
    expect(out.candidates.filter((c) => c.id === pool[0].id)).toHaveLength(1);
  });

  it("ranks loved dishes first and disliked last, but keeps the disliked", () => {
    const pool = library();
    const out = buildShortlist(pool, ctx({ people: [anna, bo] })).candidates.map((c) => c.title);
    expect(out[0]).toMatch(/Pasta/);
    expect(out.at(-1)).toBe("Svampsoppa");
  });

  it("boosts offers and use-soon, and penalises recent weeks", () => {
    const a = recipe("A-rätt", ["potatis"]);
    const b = recipe("B-rätt", ["potatis"], { offers: [{ name: "Potatis", price: "9 kr/kg", store: "ICA" }] });
    const c = recipe("C-rätt", ["potatis"], { useSoon: [{ name: "Potatis", expiresWeekday: 5 }] });
    expect(buildShortlist([a, b, c], ctx()).candidates.map((x) => x.title)).toEqual(["C-rätt", "B-rätt", "A-rätt"]);
    expect(buildShortlist([a, b, c], ctx({ settings: settings({ useSoonFirst: false, favourOffers: false }) })).candidates.map((x) => x.title)).toEqual(["A-rätt", "B-rätt", "C-rätt"]);
    const recent = buildShortlist([b, a], ctx({ recent: [{ recipeId: b.id, weeksAgo: 1 }] })).candidates;
    expect(recent[0].title).toBe("A-rätt");
    expect(scoreCandidate(b, ctx({ recent: [{ recipeId: b.id, weeksAgo: 2 }] }))).toBeGreaterThan(scoreCandidate(b, ctx({ recent: [{ recipeId: b.id, weeksAgo: 1 }] })));
  });

  it("a low budget drops costly dishes while enough remain, and gives offers more weight", () => {
    const pool = Array.from({ length: 10 }, (_, i) => recipe(`Rätt ${i}`, ["ris"], { costLevel: i < 2 ? "high" : "normal" }));
    expect(buildShortlist(pool, ctx({ settings: settings({ budget: "low" }) })).candidates).toHaveLength(8);
    const few = pool.slice(0, 5);
    expect(buildShortlist(few, ctx({ settings: settings({ budget: "low" }) })).candidates).toHaveLength(5);
  });

  it("caps the list at 30 and at most eight of one kind", () => {
    const pool = Array.from({ length: 60 }, (_, i) => recipe(`Pasta nr ${i}`, ["pasta"]));
    expect(buildShortlist(pool, ctx()).candidates.length).toBeLessThanOrEqual(maxShortlist);
    const mixed = [...pool, ...library()];
    const out = buildShortlist(mixed, ctx()).candidates;
    expect(out.filter((c) => c.title.startsWith("Pasta nr")).length).toBeLessThanOrEqual(8 + 6);
    expect(out.length).toBeLessThanOrEqual(30);
  });

  it("makes sure vegetarian days have vegetarian dishes in the list", () => {
    const meat = Array.from({ length: 12 }, (_, i) => recipe(`Kött ${i}`, ["500 g nötfärs"], { offers: [{ name: "Nötfärs", price: null, store: null }] }));
    const veg = [recipe("Bönchili", ["2 burkar bönor", "1 lök"]), recipe("Ostpaj", ["1 paj", "ost"])];
    const out = buildShortlist([...meat, ...veg], ctx({ settings: settings({ vegetarianDays: [2] }) }), 5).candidates;
    expect(out.map((c) => c.title)).toEqual(expect.arrayContaining(["Bönchili"]));
    expect(out).toHaveLength(5);
  });

  it("is deterministic", () => {
    const pool = library();
    expect(buildShortlist(pool, ctx())).toEqual(buildShortlist([...pool].reverse(), ctx()));
  });

  it("ranks quick dishes higher when weekdays are quick", () => {
    const slow = recipe("Långkok", ["lamm"], { totalMinutes: 120 });
    const quick = recipe("Snabbpasta", ["pasta"], { totalMinutes: 15 });
    expect(buildShortlist([slow, quick], ctx({ settings: settings({ quickWeekdays: true }) })).candidates[0].title).toBe("Snabbpasta");
    expect(id(1)).toBeTruthy();
    expect(weekStart).toBe("2026-11-16");
  });
});
