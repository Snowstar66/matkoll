import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saveOption } from "@/lib/options";
import { KOSTRAD_GROUPS, type KostradGroup } from "../domain/groups";
import type { RecipeNutrition } from "../domain/recipe-nutrition";
import { weekLineText } from "../domain/texts";
import { NutritionCard } from "./nutrition-card";
import { NutritionWeekLine } from "./week-line";

// The nutrition card, its sheet and the week line: nothing without Tillval "Visa näring",
// kcal and grams only with "Visa kcal".

function dish(groups: Partial<Record<KostradGroup, number>>, coverage = { counted: 9, total: 11 }): RecipeNutrition {
  const g = Object.fromEntries(KOSTRAD_GROUPS.map((group) => [group, groups[group] ?? 0])) as Record<KostradGroup, number>;
  return {
    perServing: { kcal: 304, proteinG: 11.2, fatG: 14.4, carbsG: 26.6, fiberG: 6.1 },
    gramsPerServing: Object.values(g).reduce((a, b) => a + b, 0),
    groupGrams: g,
    plateGrams: { gronsaker: g.gronsak + g.baljvaxt, kolhydrater: g.fullkorn + g.raffinerad, protein: g.fisk + g.rott_kott + g.fagel + g.agg },
    coverage,
  };
}

const green = dish({ gronsak: 280, agg: 40, raffinerad: 30 });
const fish = dish({ gronsak: 40, fisk: 120, raffinerad: 60 });

beforeEach(() => localStorage.clear());

describe("NutritionCard", () => {
  it("shows nothing while Visa näring is off (the default)", () => {
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    expect(screen.queryByTestId("nutrition-card")).not.toBeInTheDocument();
  });

  it("shows the plate, the tag and the legend, and no numbers, with Visa näring on", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    const card = screen.getByTestId("nutrition-card");
    expect(within(card).getByTestId("nutrition-plate")).toBeInTheDocument();
    expect(within(card).getByText("Mycket grönt")).toBeInTheDocument();
    for (const word of ["Grönt", "Protein", "Kolhydrater"]) expect(within(card).getByText(word)).toBeInTheDocument();
    expect(card).not.toHaveTextContent("kcal");
  });

  it("adds ca 300 kcal per portion with Visa kcal on", () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    expect(screen.getByTestId("nutrition-kcal")).toHaveTextContent("ca 300 kcal per portion");
  });

  it("ignores Visa kcal when Visa näring is off", () => {
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    expect(screen.queryByTestId("nutrition-card")).not.toBeInTheDocument();
  });

  it("shows no card when there is neither a plate nor a tag", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Tomt" nutrition={dish({ gronsak: 30 })} />);
    expect(screen.queryByTestId("nutrition-card")).not.toBeInTheDocument();
  });

  it("opens the sheet Näring: the plate parts, the tag explained, the coverage and the source; no grams without Visa kcal", async () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    const sheet = await screen.findByRole("dialog", { name: "Näring" });
    expect(within(sheet).getByText("Spagettipumpa, per portion")).toBeInTheDocument();
    expect(within(sheet).getByText("Grönsaker")).toBeInTheDocument();
    expect(within(sheet).getByText("ca 80 %")).toBeInTheDocument();
    expect(within(sheet).getByText("Mer än halva tallriken är grönsaker.")).toBeInTheDocument();
    expect(within(sheet).getByText(/Räknat på 9 av 11 varor\./)).toBeInTheDocument();
    expect(within(sheet).getByText(/Livsmedelsverkets livsmedelsdatabas/)).toBeInTheDocument();
    expect(within(sheet).queryByText("Per portion")).not.toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Klar" })).toBeInTheDocument();
  });

  it("lists energy and grams in the sheet with Visa kcal on", async () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    const sheet = await screen.findByRole("dialog", { name: "Näring" });
    for (const [label, value] of [
      ["Energi", "ca 300 kcal"],
      ["Protein", "11 g"],
      ["Fett", "14 g"],
      ["Kolhydrater", "27 g"],
      ["Fiber", "6 g"],
    ]) {
      expect(within(sheet).getByText(label, { selector: "dt" }).nextElementSibling).toHaveTextContent(value);
    }
  });

  it("shows the Fisk tag", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Lax" nutrition={fish} />);
    expect(within(screen.getByTestId("nutrition-tags")).getByText("Fisk")).toBeInTheDocument();
  });
});

describe("weekLineText", () => {
  const base = { dinners: 5, assessed: 5, redMeatGramsPerPerson: 0 };
  it("names the parts that are more than zero, with the right plurals", () => {
    expect(weekLineText({ ...base, fishDishes: 2, greenDishes: 3 })).toBe("Veckans middagar: 2 fiskrätter · 3 gröna");
    expect(weekLineText({ ...base, fishDishes: 1, greenDishes: 1 })).toBe("Veckans middagar: 1 fiskrätt · 1 grön");
    expect(weekLineText({ ...base, fishDishes: 0, greenDishes: 1 })).toBe("Veckans middagar: 1 grön");
  });
  it("has nothing to say without fish or green dishes", () => {
    expect(weekLineText({ ...base, fishDishes: 0, greenDishes: 0 })).toBeNull();
  });
});

describe("NutritionWeekLine", () => {
  const dinners = [green, fish, null];

  it("shows nothing while Visa näring is off", () => {
    render(<NutritionWeekLine dinners={dinners} />);
    expect(screen.queryByTestId("nutrition-week-line")).not.toBeInTheDocument();
  });

  it("says how many fish and green dinners the week has", () => {
    saveOption("showNutrition", true);
    render(<NutritionWeekLine dinners={dinners} />);
    expect(screen.getByTestId("nutrition-week-line")).toHaveTextContent("Veckans middagar: 1 fiskrätt · 1 grön");
  });

  it("is left out when nothing can be said", () => {
    saveOption("showNutrition", true);
    render(<NutritionWeekLine dinners={[null, null]} />);
    expect(screen.queryByTestId("nutrition-week-line")).not.toBeInTheDocument();
  });
});
