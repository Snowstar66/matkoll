import { describe, expect, it } from "vitest";
import { almanacActivities, almanacAdvice, almanacLine } from "./almanac";
import { addDays, dayKey, easterSunday, nthWeekday, shortDateText, stockholmDay } from "./dates";
import { foodDayOn } from "./food-days";
import { nameDayLine, nameDayNames } from "./name-days";
import { seasonLine } from "./season";
import { foodLine, todayLines } from "./today-lines";

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe("dates", () => {
  it("computes Easter Sunday", () => {
    expect(easterSunday(2024)).toEqual(d(2024, 3, 31));
    expect(easterSunday(2025)).toEqual(d(2025, 4, 20));
    expect(easterSunday(2026)).toEqual(d(2026, 4, 5));
    expect(easterSunday(2027)).toEqual(d(2027, 3, 28));
  });

  it("finds the nth weekday of a month", () => {
    expect(nthWeekday(2026, 8, 4, 3)).toEqual(d(2026, 8, 20)); // third Thursday
    expect(nthWeekday(2025, 8, 3, 2)).toEqual(d(2025, 8, 13)); // second Wednesday
  });

  it("reads the Stockholm day, not the UTC day", () => {
    expect(dayKey(stockholmDay(new Date("2026-11-07T23:30:00Z")))).toBe("2026-11-08");
    expect(addDays(d(2026, 12, 31), 1)).toEqual(d(2027, 1, 1));
  });

  it("writes the short date", () => {
    expect(shortDateText(d(2026, 11, 8))).toBe("sön 8 nov");
    expect(shortDateText(d(2026, 3, 25))).toBe("ons 25 mars");
  });
});

describe("food days", () => {
  it("has the fixed days", () => {
    expect(foodDayOn(d(2026, 10, 4))?.name).toBe("Kanelbullens dag");
    expect(foodDayOn(d(2026, 3, 25))?.name).toBe("Våffeldagen");
    expect(foodDayOn(d(2026, 11, 7))?.name).toBe("Kladdkakans dag");
    expect(foodDayOn(d(2026, 5, 11))?.name).toBe("Chokladbollens dag");
  });

  it("computes fettisdagen from Easter", () => {
    expect(foodDayOn(d(2024, 2, 13))?.name).toBe("Semmeldagen");
    expect(foodDayOn(d(2025, 3, 4))?.name).toBe("Semmeldagen");
    expect(foodDayOn(d(2026, 2, 17))?.name).toBe("Semmeldagen");
    expect(foodDayOn(d(2027, 2, 9))?.name).toBe("Semmeldagen");
    expect(foodDayOn(d(2026, 2, 16))).toBeNull();
  });

  it("computes the August premieres, midsommarafton and påskafton", () => {
    expect(foodDayOn(d(2026, 8, 20))?.name).toBe("Surströmmingspremiären");
    expect(foodDayOn(d(2025, 8, 21))?.name).toBe("Surströmmingspremiären");
    expect(foodDayOn(d(2026, 8, 12))?.name).toBe("Kräftpremiär");
    expect(foodDayOn(d(2026, 6, 19))?.name).toBe("Midsommarafton");
    expect(foodDayOn(d(2025, 6, 20))?.name).toBe("Midsommarafton");
    expect(foodDayOn(d(2026, 4, 4))?.name).toBe("Påskafton");
  });

  it("is quiet on an ordinary day", () => {
    expect(foodDayOn(d(2026, 11, 8))).toBeNull();
  });
});

describe("season", () => {
  const recipes = [
    { id: "a", title: "Caesarkyckling med rostade rotfrukter" },
    { id: "b", title: "Spagettipumpa" },
  ];

  it("names the first seasonal item a recipe uses", () => {
    const line = seasonLine(11, recipes);
    expect(line?.item.definite).toBe("Pumpan");
    expect(line?.recipe?.id).toBe("b");
  });

  it("skips an item no recipe uses", () => {
    expect(seasonLine(11, [recipes[0]])?.item.definite).toBe("Rotfrukterna");
  });

  it("falls back to the month's first item without a matching recipe", () => {
    const line = seasonLine(11, [{ id: "x", title: "Pannkakor" }]);
    expect(line).toMatchObject({ recipe: null });
    expect(line?.item.definite).toBe("Pumpan");
  });

  it("writes the lines", () => {
    expect(foodLine(d(2026, 11, 8), recipes)).toEqual([
      { text: "Pumpan är som bäst nu – du har " },
      { text: "Spagettipumpa", recipeId: "b" },
      { text: "." },
    ]);
    expect(foodLine(d(2026, 11, 8), [])).toEqual([{ text: "Pumpan är som bäst nu." }]);
    expect(foodLine(d(2026, 10, 4), recipes)).toEqual([{ text: "Idag är det Kanelbullens dag. Fika efter maten?" }]);
  });
});

describe("name days", () => {
  it("has the official list's days", () => {
    expect(nameDayNames(11, 8)).toEqual(["Vendela"]);
    expect(nameDayNames(12, 15)).toEqual(["Gottfrid"]);
    expect(nameDayNames(2, 28)).toEqual(["Maria", "Maja"]);
    expect(nameDayNames(1, 19)).toEqual(["Henrik", "Henry"]);
    expect(nameDayNames(12, 25)).toEqual([]);
    expect(nameDayNames(2, 29)).toEqual([]);
  });

  it("has an entry for every day of the year", () => {
    for (let month = 1; month <= 12; month++) {
      const days = new Date(Date.UTC(2024, month, 0)).getUTCDate();
      for (let day = 1; day <= days; day++) expect(Array.isArray(nameDayNames(month, day))).toBe(true);
    }
  });

  it("writes the line", () => {
    expect(nameDayLine(11, 8)).toBe("Vendela har namnsdag");
    expect(nameDayLine(2, 28)).toBe("Maria och Maja har namnsdag");
    expect(nameDayLine(1, 6)).toBe("Kasper, Melker och Baltsar har namnsdag");
    expect(nameDayLine(12, 25)).toBeNull();
  });
});

describe("almanac", () => {
  it("keeps everyday activities in Swedish, food and planning first", () => {
    expect(almanacActivities(["嫁娶", "扫舍", "会亲友"])).toEqual(["bjuda hem vänner på mat", "städa hemma"]);
    // Funerals and graves are never kept.
    expect(almanacActivities(["安葬", "修坟", "入殓"])).toEqual([]);
    // The most common term comes last.
    expect(almanacActivities(["祭祀", "安床"])).toEqual(["byta sängkläder", "laga ett gammalt familjerecept"]);
  });

  it("says what the day is good for and one thing to avoid", () => {
    expect(almanacAdvice(["扫舍", "纳财", "沐浴"], ["开市", "嫁娶"])).toBe("Bra dag att fylla på förrådet och städa hemma. Undvik att storhandla.");
    expect(almanacAdvice(["安葬"], ["开市"])).toBe("Undvik i dag att storhandla.");
    expect(almanacAdvice(["安葬"], ["行丧"])).toBeNull();
    // Two terms with one phrase: kept as good only.
    expect(almanacAdvice(["移徙"], ["入宅"])).toBe("Bra dag att möblera om.");
    expect(almanacAdvice(["诸事不宜"], [])).toBe("En dag att ta det lugnt.");
  });

  it("gives the advice for 8 Nov 2026 without the day's animal", async () => {
    expect(await almanacLine(d(2026, 11, 8))).toBe("Bra dag att fixa det som är trasigt och byta sängkläder. Undvik att göra om i köket.");
  });
});

describe("today lines", () => {
  const day = d(2026, 11, 8);
  const recipes = [{ id: "b", title: "Spagettipumpa" }];

  it("gives only the food line by default", () => {
    const lines = todayLines(day, { food: true, nameDay: false, almanac: false }, recipes);
    expect(lines).toHaveLength(1);
  });

  it("puts name day and almanac on lines of their own under the food line", () => {
    const lines = todayLines(day, { food: true, nameDay: true, almanac: true }, recipes, "Bra dag att städa hemma.");
    expect(lines).toHaveLength(3);
    expect(lines[1][0].text).toBe("Vendela har namnsdag");
    expect(lines[2][0].text).toBe("Bra dag att städa hemma.");
  });

  it("shows the extras alone when food is off, and nothing when all are off", () => {
    expect(todayLines(day, { food: false, nameDay: true, almanac: true }, recipes, "Bra dag att städa hemma.")).toHaveLength(2);
    expect(todayLines(day, { food: false, nameDay: false, almanac: false }, recipes)).toEqual([]);
  });
});
