import { describe, expect, it } from "vitest";
import { applyPlan, lockedDaysOf, rerollableDays } from "./apply";
import { anna, input, library, recipe, settings } from "./fixtures";
import { dayRoles, fallbackPicks, planAroundFixed, planDeterministic, validatePicks, validatePlan } from "./plan";
import { buildShortlist } from "./shortlist";
import type { FixedDay, PlanInput } from "./types";

const pannkaka = (dayIndex = 4, extra: Partial<FixedDay> = {}): FixedDay => ({ dayIndex, recipeId: "11111111-1111-4111-8111-111111111111", title: "Pannkaka", ingredients: ["3 dl vetemjöl", "6 dl mjölk", "3 ägg"], ...extra });
const codes = (v: { code: string }[]) => v.map((x) => x.code);

describe("dayRoles", () => {
  it("fills Mån-Fre for 5 dinners on an empty week", () => {
    expect(dayRoles(input([])).open).toEqual([1, 2, 3, 4, 5]);
  });
  it("counts fixed days as dinners and plans the rest around them", () => {
    const roles = dayRoles(input([], { fixedDays: [pannkaka(4)] }));
    expect(roles.open).toEqual([1, 2, 3, 5]);
    expect(roles.needed).toBe(4);
  });
  it("never plans a day that is already over: Wednesday 11 Nov with 5 dinners gives Wed-Sun, not Tue-Sat", () => {
    const roles = dayRoles(input([], { pastDays: [1, 2] }));
    expect(roles.open).toEqual([3, 4, 5, 6, 7]);
  });
  it("a fixed day on a past day stays fixed and the rest are planned from today", () => {
    const roles = dayRoles(input([], { pastDays: [1, 2], fixedDays: [pannkaka(2)], settings: settings({ dinners: 5 }) }));
    expect(roles.fixed.has(2)).toBe(true);
    expect(roles.open).toEqual([3, 4, 5, 6]);
  });
  it("skips skip and leftover days; a fixed day wins over a skip day", () => {
    const roles = dayRoles(input([], { settings: settings({ skipDays: [1], leftoverDays: [2], dinners: 4 }), fixedDays: [pannkaka(1)] }));
    expect(roles.open).toEqual([3, 4, 5]);
    expect(roles.fixed.has(1)).toBe(true);
    expect(roles.skip.has(1)).toBe(false);
  });
  it("has nothing to fill when the dinners are already there", () => {
    const fixed = [1, 2, 3, 4, 5].map((d) => pannkaka(d, { recipeId: null }));
    expect(dayRoles(input([], { fixedDays: fixed })).needed).toBe(0);
  });
});

describe("planDeterministic", () => {
  it("fills five different dinners on an empty week, seven days in the proposal", () => {
    const pool = library();
    const result = planDeterministic(input(pool));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.proposal.days).toHaveLength(7);
    const dinners = result.proposal.days.filter((d) => d.recipeId);
    expect(dinners).toHaveLength(5);
    expect(new Set(dinners.map((d) => d.recipeId)).size).toBe(5);
    expect(dinners.map((d) => d.dayIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(result.proposal.days.slice(5).map((d) => d.slot)).toEqual(["skip", "skip"]);
    expect(result.violations.filter((v) => v.severity === "hard")).toEqual([]);
    expect(planDeterministic(input(pool))).toEqual(result);
  });

  it("never proposes a dish with a household allergen, even if the shortlist is wrong", () => {
    const result = planDeterministic(input(library(), { people: [anna] }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const titles = result.proposal.days.map((d) => d.title);
    for (const bad of ["Kycklinggryta", "Fiskgratäng", "Pannkakor", "Korvstroganoff"]) expect(titles).not.toContain(bad);
  });

  it("keeps fixed days locked, plans around them and refers to them", () => {
    const result = planDeterministic(input(library(), { fixedDays: [pannkaka(4)] }));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [, , , thu, fri] = result.proposal.days;
    expect(thu).toMatchObject({ source: "fixed", locked: true, title: "Pannkaka", recipeId: pannkaka().recipeId });
    expect(thu.reasons).toEqual(["Er egen rätt"]);
    expect(fri.reasons).toContain("Efter Pannkaka torsdag");
    expect(result.proposal.days.filter((d) => d.recipeId)).toHaveLength(5);
    expect(result.proposal.days.filter((d) => d.source === "proposed" && d.recipeId)).toHaveLength(4);
  });

  it("marks a fixed dish that holds an allergen with a warning instead of removing it", () => {
    const result = planDeterministic(input(library(), { fixedDays: [pannkaka(2)], people: [anna] }));
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days[1].allergyWarning).toBe("Kan innehålla laktos (Anna)");
    expect(result.proposal.days[1].locked).toBe(true);
    expect(result.proposal.days.filter((d) => d.source === "proposed").every((d) => d.allergyWarning === null)).toBe(true);
  });

  it("tells a week_agent-placed row from the user's own in the reason", () => {
    const result = planDeterministic(input(library(), { fixedDays: [pannkaka(2, { placedBy: "week_agent" })] }));
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days[1].reasons).toEqual(["Från ett tidigare förslag"]);
    expect(result.proposal.days[1].source).toBe("fixed");
  });

  it("builds reasons from facts: offer with store, expiry day", () => {
    const pool = [
      recipe("Laxpasta", ["laxfilé", "pasta"], { offers: [{ name: "Laxfilé", price: "89 kr/kg", store: "ICA Nära" }] }),
      recipe("Kycklingwok", ["kyckling", "paprika"], { useSoon: [{ name: "Kyckling", expiresWeekday: 5 }] }),
      ...library().slice(0, 4),
    ];
    const result = planDeterministic(input(pool));
    if (result.status !== "ok") throw new Error("ok expected");
    const reasons = result.proposal.days.flatMap((d) => d.reasons);
    expect(reasons).toContain("Extrapris på Laxfilé (89 kr/kg) hos ICA Nära");
    expect(reasons).toContain("Kyckling går ut fredag");
    const wok = result.proposal.days.find((d) => d.title === "Kycklingwok");
    expect(wok?.useSoonTags).toEqual([{ name: "Kyckling", expiresWeekday: 5 }]);
    expect(wok!.dayIndex).toBeLessThanOrEqual(5);
  });

  it("does not use offers or expiry in reasons when those settings are off", () => {
    const pool = [recipe("Laxpasta", ["laxfilé"], { offers: [{ name: "Laxfilé", price: null, store: null }] }), ...library()];
    const result = planDeterministic(input(pool, { settings: settings({ favourOffers: false }) }));
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days.every((d) => d.offerTags.length === 0)).toBe(true);
  });

  it("puts vegetarian dishes on vegetarian days and nothing on skip days; marks leftover days", () => {
    const result = planDeterministic(input(library(), { settings: settings({ vegetarianDays: [2], leftoverDays: [3], skipDays: [5], dinners: 4 }) }));
    if (result.status !== "ok") throw new Error("ok expected");
    const [mon, tue, wed, thu, fri] = result.proposal.days;
    expect(["Linssoppa", "Grönsakscurry", "Wok med nudlar och tofu", "Svampsoppa", "Pannkakor"]).toContain(tue.title);
    expect(wed).toMatchObject({ slot: "leftover", recipeId: null });
    expect(fri).toMatchObject({ slot: "skip", recipeId: null });
    expect([mon, tue, thu].every((d) => d.recipeId)).toBe(true);
    expect(result.proposal.days[5].recipeId).not.toBeNull(); // Lör gets the 4th dinner
  });

  it("avoids the same kind of dish on neighbouring days", () => {
    const pasta = [recipe("Pasta A", ["pasta"]), recipe("Pasta B", ["pasta"]), recipe("Pasta C", ["pasta"])];
    const other = [recipe("Fiskgryta", ["torsk"]), recipe("Soppa X", ["potatis"]), recipe("Wok Y", ["nudlar"])];
    const result = planDeterministic(input([...pasta, ...other], { settings: settings({ dinners: 5 }) }));
    if (result.status !== "ok") throw new Error("ok expected");
    expect(codes(result.violations)).not.toContain("same_kind_adjacent");
  });

  it("puts slow dishes at the weekend when weekdays are quick", () => {
    const pool = [
      recipe("Långkok", ["lamm"], { totalMinutes: 150 }),
      recipe("Snabb 1", ["ris"], { totalMinutes: 15 }),
      recipe("Snabb 2", ["nudlar"], { totalMinutes: 15 }),
      recipe("Snabb 3", ["potatis"], { totalMinutes: 20 }),
    ];
    const result = planDeterministic(input(pool, { settings: settings({ quickWeekdays: true, dinners: 4, skipDays: [4, 5] }) }));
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days.find((d) => d.title === "Långkok")?.dayIndex).toBeGreaterThanOrEqual(6);
  });

  it("stops with too_few_recipes, naming how many were needed and what was left out for allergy", () => {
    const pool = library().slice(0, 3);
    const excluded = [{ recipeId: "x", title: "Pannkakor", allergens: ["laktos"] }];
    expect(planDeterministic(input(pool), excluded)).toEqual({ status: "too_few_recipes", needed: 5, available: 3, excludedForAllergy: excluded });
  });

  it("too_few_recipes when every library dish has an allergen", () => {
    const all = library();
    const sl = buildShortlist(all.filter((r) => /Grädde|grädde|mjölk|Kyckling/.test(r.ingredients.join(" "))), { ...input([]), people: [anna] });
    const result = planDeterministic(input(sl.candidates, { people: [anna] }), sl.excludedForAllergy);
    expect(result.status).toBe("too_few_recipes");
  });

  it("reaches a full week through buildShortlist on a library with allergies", () => {
    const sl = buildShortlist(library(), { ...input([]), people: [anna] });
    const result = planDeterministic(input(sl.candidates, { people: [anna] }), sl.excludedForAllergy);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.excludedForAllergy.length).toBeGreaterThan(0);
  });
});

describe("validatePicks / planAroundFixed", () => {
  const pool = library();
  const base = (extra: Partial<PlanInput> = {}) => input(pool, extra);

  it("accepts a clean set of picks", () => {
    const picks = fallbackPicks(base());
    expect(validatePicks(base(), picks).filter((v) => v.severity === "hard")).toEqual([]);
  });

  it("flags and drops a dish with an allergen, however it got there", () => {
    const i = base({ people: [anna] });
    const cooked = pool.find((r) => r.title === "Kycklinggryta")!;
    const picks = [{ dayIndex: 1, recipeId: cooked.id }, ...fallbackPicks(i).filter((p) => p.dayIndex !== 1)];
    expect(codes(validatePicks(i, picks))).toContain("allergen_dish");
    const result = planAroundFixed(i, picks);
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days[0].recipeId).toBeNull();
    expect(codes(result.violations)).toEqual(expect.arrayContaining(["allergen_dish", "wrong_dinner_count"]));
  });

  it("flags duplicates, unknown recipes, fixed and closed days", () => {
    const i = base({ fixedDays: [pannkaka(4, { recipeId: pool[0].id })], settings: settings({ skipDays: [2] }) });
    const v = validatePicks(i, [
      { dayIndex: 1, recipeId: pool[1].id },
      { dayIndex: 3, recipeId: pool[1].id }, // duplicate
      { dayIndex: 4, recipeId: pool[2].id }, // fixed day
      { dayIndex: 2, recipeId: pool[3].id }, // skip day
      { dayIndex: 5, recipeId: "ffffffff-ffff-4fff-8fff-ffffffffffff" }, // unknown
      { dayIndex: 6, recipeId: pool[4].id }, // beyond the dinners
      { dayIndex: 5, recipeId: pool[0].id }, // same as a fixed dish
    ]);
    expect(codes(v)).toEqual(expect.arrayContaining(["duplicate_recipe", "fixed_day_touched", "day_not_open", "unknown_recipe", "wrong_dinner_count"]));
    expect(v[0].severity).toBe("hard");
  });

  it("flags meat on a vegetarian day", () => {
    const i = base({ settings: settings({ vegetarianDays: [1] }) });
    expect(codes(validatePicks(i, [{ dayIndex: 1, recipeId: pool[0].id }]))).toContain("vegetarian_day_meat");
  });

  it("never overwrites a fixed day: the proposal keeps it exactly", () => {
    const i = base({ fixedDays: [pannkaka(1)] });
    const result = planAroundFixed(i, [{ dayIndex: 1, recipeId: pool[0].id }, ...fallbackPicks(i)]);
    if (result.status !== "ok") throw new Error("ok expected");
    expect(result.proposal.days[0]).toMatchObject({ title: "Pannkaka", locked: true, source: "fixed" });
    expect(codes(result.violations)).toContain("fixed_day_touched");
  });

  it("reports soft problems without failing: slow weekday, recent repeat, same kind next to a fixed dish", () => {
    const i = base({ settings: settings({ quickWeekdays: true, dinners: 3 }), recent: [{ recipeId: pool[1].id, weeksAgo: 1 }] });
    const v = validatePicks(i, [{ dayIndex: 1, recipeId: pool[1].id }, { dayIndex: 2, recipeId: pool[2].id }, { dayIndex: 3, recipeId: pool[3].id }]);
    expect(codes(v)).toEqual(expect.arrayContaining(["slow_weekday", "recent_repeat"]));
    expect(v.filter((x) => x.severity === "hard")).toEqual([]);
    const a = recipe("Pasta A", ["pasta"]);
    const b = recipe("Pasta B", ["pasta"]);
    const same = validatePicks(input([a, b], { settings: settings({ dinners: 2 }) }), [{ dayIndex: 1, recipeId: a.id }, { dayIndex: 2, recipeId: b.id }]);
    expect(codes(same)).toContain("same_kind_adjacent");
  });

  it("validatePlan holds a proposal (also an edited one) to the same rules and checks the fixed days", () => {
    const i = base({ fixedDays: [pannkaka(4)] });
    const result = planDeterministic(i);
    if (result.status !== "ok") throw new Error("ok expected");
    expect(validatePlan(i, result.proposal).filter((v) => v.severity === "hard")).toEqual([]);
    const tampered = { ...result.proposal, days: result.proposal.days.map((d) => (d.dayIndex === 4 ? { ...d, recipeId: pool[0].id, title: "Pasta" } : d)) };
    expect(codes(validatePlan(i, tampered))).toContain("fixed_day_touched");
    const dup = { ...result.proposal, days: result.proposal.days.map((d) => (d.dayIndex === 2 ? { ...d, recipeId: result.proposal.days[0].recipeId } : d)) };
    expect(codes(validatePlan(i, dup))).toContain("duplicate_recipe");
  });
});

describe("applyPlan and re-roll", () => {
  const i = input(library(), { fixedDays: [pannkaka(4)] });
  const result = planDeterministic(i);
  if (result.status !== "ok") throw new Error("ok expected");
  const { proposal } = result;

  it("writes only proposed dinners on empty days", () => {
    const out = applyPlan(proposal, [4]);
    expect(out.write.map((d) => d.dayIndex)).toEqual([1, 2, 3, 5]);
    expect(out.skippedOccupied).toEqual([]);
  });

  it("does not write over a day that already has a dish, unless confirmed", () => {
    const out = applyPlan(proposal, [2, 4]);
    expect(out.write.map((d) => d.dayIndex)).toEqual([1, 3, 5]);
    expect(out.skippedOccupied.map((d) => d.dayIndex)).toEqual([2]);
    expect(applyPlan(proposal, [2, 4], true).write.map((d) => d.dayIndex)).toEqual([1, 2, 3, 5]);
  });

  it("re-rolls only unlocked days, keeping locked ones as fixed", () => {
    const locked = { ...proposal, days: proposal.days.map((d) => (d.dayIndex === 1 ? { ...d, locked: true } : d)) };
    expect(rerollableDays(locked)).toEqual([2, 3, 5, 6, 7].filter((d) => locked.days[d - 1].slot === "dinner"));
    const keep = lockedDaysOf(locked, () => ["ingrediens"]);
    expect(keep.map((d) => [d.dayIndex, d.source])).toEqual([[1, "proposed"], [4, "fixed"]]);
    const again = planDeterministic({ ...i, fixedDays: keep });
    if (again.status !== "ok") throw new Error("ok expected");
    expect(again.proposal.days[0]).toMatchObject({ source: "proposed", locked: true });
    expect(again.proposal.days.filter((d) => d.recipeId)).toHaveLength(5);
  });
});
