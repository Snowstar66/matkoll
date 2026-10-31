import { describe, expect, it } from "vitest";
import { parseRecipeCategory, recipeCategories } from "./recipe-category";

const categories = (title: string, ingredients: string[] = [], totalMinutes: number | null = null) =>
  recipeCategories({ title, ingredients, totalMinutes });

describe("recipeCategories", () => {
  it("reads Caesarkyckling med rostade rotfrukter as Fågel and Sallad", () => {
    expect(categories("Caesarkyckling med rostade rotfrukter", ["400 g kycklingfilé", "2 morötter"], 45)).toEqual(["poultry", "salad"]);
  });

  it("reads Korv stroganoff as Kött and Gryta", () => {
    expect(categories("Korv stroganoff", ["400 g falukorv", "2 dl matlagningsgrädde"], 40)).toEqual(["meat", "stew"]);
  });

  it("reads Spagettipumpa as Vegetariskt, not Pasta, when no ingredient is meat", () => {
    expect(categories("Spagettipumpa", ["1 spagettipumpa", "2 dl riven parmesan", "1 msk olivolja"], 60)).toEqual(["vegetarian"]);
  });

  it("does not read a squash or a paste as pasta", () => {
    expect(categories("Spagettipumpa", ["1 spagetti pumpa", "4 msk chipotlepasta", "2 msk olivolja"], 60)).toEqual(["vegetarian"]);
  });

  it("reads laxpasta as Fisk & skaldjur and Pasta, whatever else is in it", () => {
    expect(categories("Laxpasta", ["300 g penne", "300 g laxfilé", "100 g bacon"], 25)).toEqual(["fish", "pasta", "quick"]);
  });

  it("does not count buljong or fond as the protein: a vegetable soup on chicken stock is Vegetariskt", () => {
    expect(categories("Grönsakssoppa", ["1 liter kycklingbuljong", "2 morötter", "1 tärning oxfond", "1 dl hönsbuljong"], 35)).toEqual([
      "vegetarian",
      "soup",
    ]);
  });

  it("is not Snabbt without a time, or with 0 minutes", () => {
    expect(categories("Pannkakor", ["3 dl mjöl"], null)).toEqual(["vegetarian"]);
    expect(categories("Pannkakor", ["3 dl mjöl"], 0)).toEqual(["vegetarian"]);
  });

  it("is Snabbt at 30 minutes and not at 31", () => {
    expect(categories("Omelett", ["3 ägg"], 30)).toContain("quick");
    expect(categories("Omelett", ["3 ägg"], 31)).not.toContain("quick");
  });

  it("takes the protein the title names first, else the one most lines name", () => {
    expect(categories("Kycklinggryta", ["300 g fläskfilé", "200 g bacon"])).toEqual(["poultry", "stew"]);
    expect(categories("Pytt i panna", ["400 g potatis", "300 g nötfärs", "200 g korv", "1 lök"])).toEqual(["meat"]);
    expect(categories("Fisksoppa", ["400 g torskfilé", "200 g räkor"])).toEqual(["fish", "soup"]);
  });

  it("does not take a nut, a substitute or a bun for meat", () => {
    expect(categories("Nötröra", ["2 dl hasselnötter", "1 dl valnötter"])).toEqual(["vegetarian"]);
    expect(categories("Vegetarisk bolognese", ["400 g vegofärs", "400 g krossade tomater"])).toEqual(["vegetarian"]);
    expect(categories("Hot dogs", ["4 korvbröd", "senap"])).toEqual(["vegetarian"]);
  });

  it("reads chicken and fish mince as their own protein, and plain mince as meat", () => {
    expect(categories("Burgare", ["500 g kycklingfärs"])).toEqual(["poultry"]);
    expect(categories("Bullar", ["500 g laxfärs"])).toEqual(["fish"]);
    expect(categories("Burgare", ["500 g blandfärs"])).toEqual(["meat"]);
  });

  it("finds Pasta in the ingredients and Soppa, Sallad and Gryta in the title", () => {
    expect(categories("Ugnsbakad kyckling", ["300 g fullkornspasta"])).toEqual(["poultry", "pasta"]);
    expect(categories("Tomatsoppa", ["800 g krossade tomater"])).toEqual(["vegetarian", "soup"]);
    expect(categories("Grekisk sallad", ["fetaost", "gurka"])).toEqual(["vegetarian", "salad"]);
    expect(categories("Linsgryta", ["2 dl röda linser"])).toEqual(["vegetarian", "stew"]);
  });

  it("does not take salad leaves in a burger for a salad", () => {
    expect(categories("Burgare", ["4 hamburgerbröd", "salladsblad", "500 g nötfärs"])).toEqual(["meat"]);
  });
});

describe("parseRecipeCategory", () => {
  it("keeps a known category and reads anything else as none", () => {
    expect(parseRecipeCategory("poultry")).toBe("poultry");
    expect(parseRecipeCategory("Fågel")).toBeNull();
    expect(parseRecipeCategory(null)).toBeNull();
  });
});
