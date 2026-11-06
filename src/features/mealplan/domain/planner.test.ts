import { describe, expect, it } from "vitest";
import { addedToWeekText, dayChipText, dishFromRow, dishNoteText, itemsText, shownDishes, weekBarText } from "./planner";
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
    expect(addedToWeekText("Korvstroganoff", 3)).toBe("Korvstroganoff på veckan. 3 varor på listan.");
    expect(addedToWeekText("Tacos", 1)).toBe("Tacos på veckan. 1 vara på listan.");
    expect(addedToWeekText("Soppa", 0)).toBe("Soppa på veckan. Inget att köpa.");
    expect(itemsText(2)).toBe("2 varor");
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

  it("says a dish's note: the offer line, else what is left to buy", () => {
    expect(dishNoteText({ buy: 2, deal: { text: "Falukorv på erbjudande · spara 21 kr" } })).toBe("Falukorv på erbjudande · spara 21 kr");
    expect(dishNoteText({ buy: 4, deal: null })).toBe("4 varor att köpa");
    expect(dishNoteText({ buy: 0, deal: null })).toBe("Allt finns hemma");
    expect(dishNoteText(undefined)).toBe("");
  });
});

describe("shownDishes", () => {
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
