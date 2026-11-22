import { beforeEach, describe, expect, it } from "vitest";
import {
  areaOptionIds,
  areaStatus,
  areasChosenMessage,
  turnOnAreas,
  areas,
  areasCardEnabled,
  areasValueText,
  outsideAreaOptionIds,
  setAll,
  toggleArea,
  uncoveredOptionIds,
  undoChanges,
} from "./option-areas";
import { type OptionId, readOption, saveOption } from "./options";

const area = (id: string) => areas.find((entry) => entry.id === id)!;

beforeEach(() => localStorage.clear());

describe("the areas of Tillval", () => {
  it("puts every switch in at most one area, and every switch in an area or on the outside list", () => {
    expect(new Set(areaOptionIds).size).toBe(areaOptionIds.length);
    for (const id of outsideAreaOptionIds) expect(areaOptionIds).not.toContain(id);
    // A new Tillval that is in neither makes this fail: put it in an area or on the outside list.
    expect(uncoveredOptionIds()).toEqual([]);
    expect(areaOptionIds).toHaveLength(12);
  });

  it("keeps the web search, Visa sidtider, Dagens and Visa delade recept outside", () => {
    expect(outsideAreaOptionIds).toEqual(expect.arrayContaining(["restaurantAgentWeb", "showTimings", "showShared", "dagensShow"]));
  });

  it("counts the box from the switches: full, half, none", () => {
    expect(areaStatus(area("nutrition"))).toBe("none");
    saveOption("showNutrition", true);
    expect(areaStatus(area("nutrition"))).toBe("half");
    saveOption("showKcal", true);
    expect(areaStatus(area("nutrition"))).toBe("full");
    // Laga mat has the three receptstöd on from the start, Startrecept off: half.
    expect(areaStatus(area("cook"))).toBe("half");
  });

  it("Äta ute turns on both its switches and never the web search, and a second tap turns both off", () => {
    const first = toggleArea(area("ute"));
    expect(first.changes.map((change) => change.id).sort()).toEqual(["menuAdvisor", "restaurantAgent"]);
    expect(first.message).toBe("Äta ute på. Slog på 2.");
    expect(readOption("menuAdvisor")).toBe(true);
    expect(readOption("restaurantAgent")).toBe(true);
    expect(readOption("restaurantAgentWeb")).toBe(false);
    expect(localStorage.getItem("livskoll-option-restaurantAgentWeb")).toBeNull();
    const second = toggleArea(area("ute"));
    expect(second.message).toBe("Äta ute av. Stängde 2.");
    expect(readOption("menuAdvisor")).toBe(false);
  });

  it("counts only the switches that changed, and half becomes full", () => {
    const result = toggleArea(area("cook"));
    expect(result.changes.map((change) => change.id)).toEqual(["starterRecipes"]);
    expect(result.message).toBe("Laga mat på. Slog på 1.");
    expect(areaStatus(area("cook"))).toBe("full");
  });

  it("Ångra puts back exactly the switches the tap changed", () => {
    saveOption("showHowOften", true);
    const result = toggleArea(area("plan"));
    expect(result.changes.map((change) => change.id).sort()).toEqual(["showPreviousWeek", "weekAgent"]);
    undoChanges(result.changes);
    expect(readOption("weekAgent")).toBe(false);
    expect(readOption("showPreviousWeek")).toBe(false);
    expect(readOption("showHowOften")).toBe(true);
  });

  it("Allt and Bara grunderna reach the 12 switches of the areas and nothing outside them", () => {
    const before = Object.fromEntries(outsideAreaOptionIds.map((id) => [id, readOption(id)]));
    saveOption("restaurantAgentWeb", true);
    saveOption("showTimings", true);
    const all = setAll(true);
    for (const id of areaOptionIds) expect(readOption(id)).toBe(true);
    expect(all.changes.length).toBeLessThanOrEqual(12);
    const none = setAll(false);
    for (const id of areaOptionIds) expect(readOption(id)).toBe(false);
    expect(none.message).toBe("Bara grunderna. Stängde 12.");
    // Switches outside the areas keep what they had (the web search and sidtider were turned on by hand above).
    expect(readOption("restaurantAgentWeb")).toBe(true);
    expect(readOption("showTimings")).toBe(true);
    for (const id of outsideAreaOptionIds.filter((id) => id !== "restaurantAgentWeb" && id !== "showTimings")) expect(readOption(id as OptionId)).toBe(before[id]);
  });

  it("keeps Fota med telefonens kamera outside the areas, so Allt never turns it on and Bara grunderna leaves it", () => {
    expect(outsideAreaOptionIds).toContain("phoneCamera");
    expect(areaOptionIds).not.toContain("phoneCamera");
    setAll(true);
    expect(readOption("phoneCamera")).toBe(false);
    saveOption("phoneCamera", true);
    setAll(false);
    expect(readOption("phoneCamera")).toBe(true);
  });

  it("setAll(true) never turns on the web search or Visa sidtider from off", () => {
    setAll(true);
    expect(readOption("restaurantAgentWeb")).toBe(false);
    expect(readOption("showTimings")).toBe(false);
  });

  it("Allt then Ångra restores the exact earlier state", () => {
    saveOption("showNutrition", true);
    const all = setAll(true);
    undoChanges(all.changes);
    expect(readOption("showNutrition")).toBe(true);
    expect(readOption("showKcal")).toBe(false);
    expect(readOption("weekAgent")).toBe(false);
  });

  it("writes the row value: at most two names, then +N, and Inget påslaget", () => {
    for (const id of areaOptionIds) saveOption(id, false);
    expect(areasValueText()).toBe("Inget påslaget");
    saveOption("weekAgent", true);
    saveOption("recipeTimer", true);
    expect(areasValueText()).toBe("Planera veckan, Laga mat");
    saveOption("showNutrition", true);
    expect(areasValueText()).toBe("Planera veckan, Laga mat +1");
  });

  it("turnOnAreas (the tour's Klar) turns on only the ticked areas, turns nothing off, and names them", () => {
    saveOption("recipeTimer", false);
    const chosen = turnOnAreas(["plan", "cook"]);
    expect(chosen.map((entry) => entry.name)).toEqual(["Planera veckan", "Laga mat"]);
    expect(areasChosenMessage(chosen)).toBe("Planera veckan och Laga mat på. Ändra under Tillval.");
    expect(readOption("weekAgent")).toBe(true);
    expect(readOption("recipeTimer")).toBe(true);
    expect(readOption("showNutrition")).toBe(false);
    expect(localStorage.getItem("livskoll-option-showNutrition")).toBeNull();
    expect(areasChosenMessage([area("ute")])).toBe("Äta ute på. Ändra under Tillval.");
  });

  it("has the off switch on, and is a plain constant", () => {
    expect(areasCardEnabled).toBe(true);
  });
});
