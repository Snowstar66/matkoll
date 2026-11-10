import { describe, expect, it } from "vitest";
import { addedToWeekText, allergyWeekText, calendarRows, targetDayText, changeDayLabel, compareByWeekday, dayChipText, dishFromRow, dishNoteText, itemsText, notOnWeek, onWeekLabel, shownDishes, weekBarText } from "./planner";
import type { PlanDish } from "./meal-plan";

const dish = (id: string, position: number, extra: Partial<PlanDish> = {}): PlanDish => ({
  id,
  recipeId: `recipe-${id}`,
  recipeTitle: id,
  servings: 4,
  position,
  recipe: null,
  ...extra,
});

describe("the words of the planning view", () => {
  it("says the toast after +", () => {
    expect(addedToWeekText("Korvstroganoff", ["falukorv", "grädde", "ris"], 4)).toBe("Korvstroganoff på torsdag. Falukorv, grädde och ris står på inköpslistan.");
    expect(addedToWeekText("Tacos", ["tortillabröd"], 1)).toBe("Tacos på måndag. Tortillabröd står på inköpslistan.");
    expect(addedToWeekText("Tacos", ["tortillabröd"], 1, "nästa vecka")).toBe("Tacos på måndag nästa vecka. Tortillabröd står på inköpslistan.");
    expect(addedToWeekText("Soppa", [], null, "om 2 veckor")).toBe("Soppa om 2 veckor. Alla dagar har en rätt. Inget att köpa.");
    expect(addedToWeekText("Soppa", [], 7)).toBe("Soppa på söndag. Inget att köpa.");
    expect(addedToWeekText("Soppa", ["lök", "morot"], null)).toBe("Soppa på veckan. Alla dagar har en rätt. Lök och morot står på inköpslistan.");
    expect(addedToWeekText("Lasagne", ["köttfärs", "krossade tomater", "ost", "pasta", "mjölk"], 2)).toBe(
      "Lasagne på tisdag. Köttfärs, krossade tomater, ost och 2 till står på inköpslistan.",
    );
    expect(changeDayLabel(4)).toBe("Byt dag");
    expect(changeDayLabel(null)).toBe("Välj dag");
    expect(onWeekLabel(4)).toBe("Tor");
    expect(onWeekLabel(null)).toBe("På veckan");
    expect(itemsText(2)).toBe("2 varor");
    expect(notOnWeek([{ id: "a" }, { id: "b" }, { id: "c" }], [{ recipeId: "b" }, { recipeId: null }]).map((o) => o.id)).toEqual(["a", "c"]);
  });

  it("says the day chip: the short weekday or Ingen dag", () => {
    expect(dayChipText(1)).toBe("Mån");
    expect(dayChipText(5)).toBe("Fre");
    expect(dayChipText(null)).toBe("Ingen dag");
    expect(dayChipText(undefined)).toBe("Ingen dag");
  });

  it("says the bar: dishes and items to buy", () => {
    expect(weekBarText(2, 6)).toBe("2 rätter · 6 varor att köpa");
    expect(weekBarText(1, 1)).toBe("1 rätt · 1 vara att köpa");
    expect(weekBarText(0, 0)).toBe("0 rätter · 0 varor att köpa");
    expect(weekBarText(3, null)).toBe("3 rätter");
  });

  it("says a dish's note: always what is left to buy (the offers are tags on their own line)", () => {
    expect(dishNoteText({ buy: 2 })).toBe("2 varor att köpa");
    expect(dishNoteText({ buy: 4 })).toBe("4 varor att köpa");
    expect(dishNoteText({ buy: 0 })).toBe("Allt finns hemma");
    expect(dishNoteText(undefined)).toBe("");
  });
});

describe("shownDishes", () => {
  it("orders by weekday Mån to Sön, no day last, and by when added within a day", () => {
    const shown = shownDishes(
      [dish("a", 0, { weekday: null }), dish("b", 1, { weekday: 5 }), dish("c", 2, { weekday: 2 }), dish("d", 3, { weekday: 5 }), dish("e", 4, { weekday: 1 })],
      new Set(),
      [],
    );
    expect(shown.map((d) => d.id)).toEqual(["e", "c", "b", "d", "a"]);
    expect(compareByWeekday({ id: "x", position: 0, weekday: 7 }, { id: "y", position: 1, weekday: null })).toBeLessThan(0);
  });

  it("puts a day just chosen in its place", () => {
    const shown = shownDishes([dish("a", 0, { weekday: 3 }), dish("b", 1, { weekday: 4 })], new Set(), [], { b: 1 });
    expect(shown.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("drops the removed, adds the just added the server does not have yet, in plan order", () => {
    const server = [dish("a", 0), dish("b", 1)];
    const added = [dish("c", 2), dish("b", 1)];
    expect(shownDishes(server, new Set(["a"]), added).map((d) => d.id)).toEqual(["b", "c"]);
  });

  it("makes a dish from the row an add returned, with no day", () => {
    const shown = dishFromRow({ id: "x", mealPlanId: "plan", recipeId: "r", recipeTitle: "Tacos", servings: 4, position: 3, weekday: null });
    expect(shown).toMatchObject({ id: "x", recipe: null, weekday: null });
  });
});

describe("calendarRows", () => {
  const d = (id: string, weekday: number | null) => dish(id, 1, { weekday });

  it("makes a row of each day: dishes, with the day on the first, and free days", () => {
    const rows = calendarRows([d("a", 1), d("b", 1), d("c", 3)], 1);
    expect(rows.map((row) => (row.kind === "dish" ? `${row.dish.id}${row.showDay ? "*" : ""}` : row.kind === "free" ? `free${row.weekday}` : "label"))).toEqual([
      "a*", "b", "free2", "c*", "free4", "free5", "free6", "free7",
    ]);
  });

  it("starts free days at the first open day", () => {
    const rows = calendarRows([d("a", 2)], 4);
    expect(rows.filter((row) => row.kind === "free").map((row) => (row.kind === "free" ? row.weekday : 0))).toEqual([4, 5, 6, 7]);
  });

  it("has no free days in a past week and puts dishes with no day last under a label", () => {
    const rows = calendarRows([d("a", 2), d("z", null)], 8);
    expect(rows.map((row) => row.kind)).toEqual(["dish", "no-day-label", "dish"]);
  });

  it("words the target day", () => {
    expect(targetDayText(2)).toBe("Läggs på tisdag");
  });
});

describe("allergyWeekText", () => {
  const allergy = (who: string) => ({ kind: "allergy", text: `Kan innehålla gluten (${who})` });
  it("is null without an allergy note, whatever else the dishes carry", () => {
    expect(allergyWeekText([undefined, [{ kind: "dislike", text: "Anna undviker lök" }]])).toBeNull();
  });
  it("counts the dishes and names each person once", () => {
    expect(allergyWeekText([[allergy("Anna")], undefined, [allergy("Anna, Bo")]])).toBe("2 rätter på veckan kan innehålla en allergen (Anna och Bo)");
    expect(allergyWeekText([[allergy("Anna")]])).toBe("1 rätt på veckan kan innehålla en allergen (Anna)");
  });
});
