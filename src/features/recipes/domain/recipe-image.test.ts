import { describe, expect, it } from "vitest";
import { recipeImageFile, recipeImageFolder, recipeImageRoute, recipeImageSrc } from "./recipe-image";

const id = "7b7b4c1e-8c0d-4a43-9a43-0a4f0a1f0a11";
const household = "1f3a2b0c-aaaa-4bbb-8ccc-0d0e0f101112";

describe("recipe image paths", () => {
  it("puts a recipe's files in <household>/<recipe>/full and /thumb", () => {
    const folder = recipeImageFolder(household, id);
    expect(folder).toBe(`${household}/${id}`);
    expect(recipeImageFile(folder, "full")).toBe(`${household}/${id}/full`);
    expect(recipeImageFile(folder, "thumb")).toBe(`${household}/${id}/thumb`);
  });

  it("serves a picture from a route that names only the recipe and the size", () => {
    expect(recipeImageRoute(id, "thumb")).toBe(`/api/recipe-image/${id}/thumb`);
  });
});

describe("recipeImageSrc", () => {
  const external = "https://img.koket.se/a.jpg";

  it("uses the app's own copy when the recipe has one, in the size asked for", () => {
    const recipe = { id, imagePath: `${household}/${id}`, imageUrl: external };
    expect(recipeImageSrc(recipe, "thumb")).toBe(`/api/recipe-image/${id}/thumb`);
    expect(recipeImageSrc(recipe, "full")).toBe(`/api/recipe-image/${id}/full`);
  });

  it("uses the app's own copy also when the recipe has no address on another site", () => {
    expect(recipeImageSrc({ id, imagePath: `${household}/${id}`, imageUrl: null }, "full")).toBe(`/api/recipe-image/${id}/full`);
  });

  it.each([null, undefined, ""])("falls back to the address on the other site without a copy (image_path %j)", (imagePath) => {
    expect(recipeImageSrc({ id, imagePath, imageUrl: external }, "thumb")).toBe(external);
  });

  it("gives null when there is neither a copy nor an address", () => {
    expect(recipeImageSrc({ id, imagePath: null, imageUrl: null }, "full")).toBeNull();
  });
});
