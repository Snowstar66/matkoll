import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { NutritionCard } from "@/features/nutrition/ui/nutrition-card";
import { saveOption } from "@/lib/options";
import { run } from "./nutrition-kladdkaka-fixture";

// Regression: a baked good has no plate (under 100 g of plate foods) but its kcal are trusted, so the card
// must still show kcal per bit and open the sheet with the numbers.

beforeEach(() => localStorage.clear());

describe("Kladdkaka nutrition card", () => {
  const { result } = run(12, "strösocker", "brunt farinsocker", "vaniljsocker");

  it("shows kcal per portion without a plate, and the sheet has the numbers", async () => {
    saveOption("showNutrition", true);
    saveOption("showKcal", true);
    render(<NutritionCard recipeTitle="Kladdkaka" nutrition={result} />);
    const card = screen.getByTestId("nutrition-card");
    expect(within(card).getByTestId("nutrition-kcal")).toHaveTextContent(/ca \d+ kcal per portion/);
    expect(within(card).queryByTestId("nutrition-plate")).not.toBeInTheDocument();
    await userEvent.click(card);
    const sheet = await screen.findByRole("dialog", { name: "Näring" });
    for (const word of ["Energi", "Protein", "Fett", "Kolhydrater", "Fiber"]) expect(within(sheet).getByText(word)).toBeInTheDocument();
    expect(within(sheet).queryByText("Tallriken")).not.toBeInTheDocument();
  });

  it("with Visa kcal off there is nothing to show, so no card (as for any recipe without plate and tag)", () => {
    saveOption("showNutrition", true);
    render(<NutritionCard recipeTitle="Kladdkaka" nutrition={result} />);
    expect(screen.queryByTestId("nutrition-card")).not.toBeInTheDocument();
  });
});
