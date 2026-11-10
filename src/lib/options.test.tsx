import { beforeEach, describe, expect, it } from "vitest";
import { optionChangedEvent, optionGroups, options, readOption, saveOption } from "./options";

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

  it("has Veckoagenten, off by default, in a group the settings page shows", () => {
    const option = options.find((entry) => entry.id === "weekAgent");
    expect(option).toMatchObject({ label: "Veckoagenten", defaultOn: false });
    expect(optionGroups.map((group) => group.id)).toContain(option?.group);
    expect(option?.hint).not.toBe("");
    expect(readOption("weekAgent")).toBe(false);
    saveOption("weekAgent", true);
    expect(readOption("weekAgent")).toBe(true);
  });
});
