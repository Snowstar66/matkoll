import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { saveOption } from "@/lib/options";
import { KOSTRAD_GROUPS, type KostradGroup } from "../domain/groups";
import type { RecipeNutrition } from "../domain/recipe-nutrition";
import { weekLineText } from "../domain/texts";
import { NutritionCard } from "./nutrition-card";
import { NutritionWeekLine, NutritionWeekLineAsync } from "./week-line";

// The nutrition card, its sheet and the week line: nothing without Tillval "Visa näring",
// kcal and grams only with "Visa kcal".

function dish(
  groups: Partial<Record<KostradGroup, number>>,
  coverage: RecipeNutrition["coverage"] = { counted: 9, total: 11 },
  uncounted: RecipeNutrition["uncounted"] = [],
  portionEstimates: RecipeNutrition["portionEstimates"] = [],
  negligible: string[] = [],
): RecipeNutrition {
  const g = Object.fromEntries(KOSTRAD_GROUPS.map((group) => [group, groups[group] ?? 0])) as Record<KostradGroup, number>;
  return {
    perServing: { kcal: 304, proteinG: 11.2, fatG: 14.4, carbsG: 26.6, fiberG: 6.1 },
    gramsPerServing: Object.values(g).reduce((a, b) => a + b, 0),
    groupGrams: g,
    plateGrams: { gronsaker: g.gronsak + g.baljvaxt, kolhydrater: g.fullkorn + g.raffinerad, protein: g.fisk + g.rott_kott + g.fagel + g.agg },
    coverage,
    uncounted,
    portionEstimates,
    negligible,
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
    for (const word of ["Grönt", "Kött & fisk", "Potatis & pasta"]) expect(within(card).getByText(word)).toBeInTheDocument();
    expect(card).not.toHaveTextContent("kcal");
  });

  it("adds ca 300 kcal per portion with Visa kcal on", () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    expect(screen.getByTestId("nutrition-kcal")).toHaveTextContent("ca 300 kcal per portion");
  });

  it("shows no kcal below 80 % counted, and the sheet says why and what was left out", async () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    const unsure = dish({ gronsak: 280, agg: 40, raffinerad: 30 }, { counted: 5, total: 8 }, [
      { label: "fransyska", reason: "unknown_ingredient", name: "fransyska", unit: null },
      { label: "crème fraiche (1 förp)", reason: "unknown_unit", name: "crème fraiche", unit: "förp" },
    ]);
    render(<NutritionCard recipeTitle="Biff" nutrition={unsure} />);
    expect(screen.queryByTestId("nutrition-kcal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nutrition-plate")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.queryByTestId("nutrition-plate")).not.toBeInTheDocument();
    expect(screen.getByTestId("nutrition-unsure")).toHaveTextContent("går inte att räkna säkert");
    expect(screen.getByTestId("nutrition-uncounted")).toHaveTextContent(
      "Räknas inte: fransyska (okänd vara), crème fraiche (1 förp, okänd storlek).",
    );
    expect(screen.queryByText("Energi")).not.toBeInTheDocument();
  });

  it("with the meat uncounted the card has no plate, only a line that opens the sheet", async () => {
    saveOption("showNutrition", true);
    const potatoes = dish({ raffinerad: 300 }, { counted: 3, total: 4 }, [{ label: "lövbiff", reason: "unknown_ingredient", name: "lövbiff", unit: null }]);
    render(<NutritionCard recipeTitle="Lövbiffsrullader" nutrition={potatoes} />);
    expect(screen.getByTestId("nutrition-card-unsure")).toHaveTextContent("Näringen kan inte räknas säkert");
    expect(screen.queryByTestId("nutrition-plate")).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.getByTestId("nutrition-uncounted")).toHaveTextContent("lövbiff (okänd vara)");
  });

  it("says in the sheet which lines were estimated as a usual portion", async () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    const rice = dish({ gronsak: 280, agg: 40, raffinerad: 75 }, { counted: 9, total: 10, estimated: 1 }, [], [{ name: "jasminris", gramsPerServing: 75 }]);
    render(<NutritionCard recipeTitle="Kyckling med ris" nutrition={rice} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.getByTestId("nutrition-portion-estimates")).toHaveTextContent("Uppskattat till en vanlig portion: jasminris 75 g per portion.");
    expect(screen.getByText(/varav 1 med uppskattad vikt/)).toBeInTheDocument();
  });

  it("names negligible ingredients that were left out", async () => {
    saveOption("showNutrition", true);
    const d = dish({ gronsak: 280, agg: 40, raffinerad: 75 }, { counted: 9, total: 9 }, [], [], ["färsk ingefära"]);
    render(<NutritionCard recipeTitle="Wok" nutrition={d} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.getByTestId("nutrition-negligible")).toHaveTextContent("Försumbart, ej medräknat: färsk ingefära.");
  });

  it("shows no estimate line when nothing was estimated", async () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.queryByTestId("nutrition-portion-estimates")).not.toBeInTheDocument();
  });

  it("explains that the plate is by weight, not nutrients", async () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.getByText("Tallriken visar hur maten fördelas i vikt, inte näringsämnen.")).toBeInTheDocument();
    expect(screen.getByText("Potatis, pasta, ris och bröd")).toBeInTheDocument();
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
    expect(within(sheet).getByText("Grönsaker och rotfrukter")).toBeInTheDocument();
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
    expect(within(sheet).getByTestId("nutrition-energy")).toHaveTextContent("Energi: ca 300 kcal");
    expect(within(sheet).getByTestId("nutrition-energy")).toHaveTextContent("46 % av en måltids riktvärde");
    for (const [key, value] of [
      ["proteinG", "11 g45 %"],
      ["fatG", "14 g60 %"],
      ["carbsG", "27 g30 %"],
      ["fiberG", "6 g61 %"],
    ]) {
      expect(within(sheet).getByTestId(`nutrition-bar-${key}`)).toHaveTextContent(value);
    }
    expect(within(sheet).getByTestId("nutrition-bar-proteinG")).toHaveAccessibleName(/Protein: 11 gram, 45 procent av riktvärdet/);
    expect(within(sheet).getByText(/riktvärde för en måltid/)).toBeInTheDocument();
    expect(within(sheet).queryByText(/krav|dagsbehov|rekommenderat/i)).not.toBeInTheDocument();
  });

  it("shows the Fisk tag", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Lax" nutrition={fish} />);
    expect(within(screen.getByTestId("nutrition-tags")).getByText("Fisk")).toBeInTheDocument();
  });
});

describe("the card's sentence", () => {
  it("shows one descriptive sentence under kcal, and the sheet repeats it", async () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Kaka" nutrition={dish({ raffinerad: 30 })} />);
    expect(screen.getByTestId("nutrition-sentence")).toHaveTextContent("Inga grönsaker.");
    await userEvent.click(screen.getByTestId("nutrition-card"));
    expect(screen.getByTestId("nutrition-sheet-sentence")).toHaveTextContent("Inga grönsaker.");
  });

  it("has no sentence when the numbers are not trustworthy", () => {
    saveOption("showNutrition", true);
    const unsure = dish({ raffinerad: 300 }, { counted: 3, total: 4 }, [{ label: "x", reason: "unknown_ingredient", name: "x", unit: null }]);
    render(<NutritionCard recipeTitle="Biff" nutrition={unsure} />);
    expect(screen.queryByTestId("nutrition-sentence")).not.toBeInTheDocument();
  });

  it("with a plate, lists the parts with their share", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Spagettipumpa" nutrition={green} />);
    expect(within(screen.getByTestId("nutrition-card")).getByText("ca 80 %")).toBeInTheDocument();
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

describe("NutritionWeekLineAsync", () => {
  it("shows the line when the nutrition promise has resolved", async () => {
    saveOption("showNutrition", true);
    await act(async () => {
      render(<NutritionWeekLineAsync recipeIds={["a", "b", null]} nutrition={Promise.resolve({ a: green, b: fish })} />);
    });
    expect(await screen.findByTestId("nutrition-week-line")).toHaveTextContent("Veckans middagar: 1 fiskrätt · 1 grön");
  });
});

describe("NutritionCard without a plate", () => {
  it("shows kcal for a trusted recipe with no plate and no tag, and none when Visa kcal is off", () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    const { unmount } = render(<NutritionCard recipeTitle="Kaka" nutrition={dish({ raffinerad: 30 })} />);
    expect(screen.getByTestId("nutrition-kcal")).toHaveTextContent("ca 300 kcal per portion");
    expect(screen.queryByTestId("nutrition-plate")).not.toBeInTheDocument();
    unmount();
    saveOption("showKcal", false);
    render(<NutritionCard recipeTitle="Kaka" nutrition={dish({ raffinerad: 30 })} />);
    expect(screen.queryByTestId("nutrition-card")).not.toBeInTheDocument();
  });
});
