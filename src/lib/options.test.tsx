import { beforeEach, describe, expect, it } from "vitest";
import { optionChangedEvent, readOption, saveOption } from "./options";

beforeEach(() => localStorage.clear());

describe("options", () => {
  it("are on by default", () => {
    expect(readOption("recipeTimer")).toBe(true);
    expect(readOption("recipeAwake")).toBe(true);
  });

  it("remember a choice per option and say when it changes", () => {
    let changes = 0;
    window.addEventListener(optionChangedEvent, () => changes++);
    saveOption("recipeTimer", false);
    expect(readOption("recipeTimer")).toBe(false);
    expect(readOption("recipeAwake")).toBe(true);
    expect(changes).toBe(1);
    saveOption("recipeTimer", true);
    expect(readOption("recipeTimer")).toBe(true);
  });

  it("fall back to the default when the stored value is junk", () => {
    localStorage.setItem("livskoll-option-recipeTimer", "banan");
    expect(readOption("recipeTimer")).toBe(true);
  });
});
