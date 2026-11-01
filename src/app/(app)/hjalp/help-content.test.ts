import { describe, expect, it } from "vitest";
import { mainDestinations } from "@/components/app-shell/destinations";
import { helpSections } from "./help-content";

describe("helpSections", () => {
  it("starts with one section per tab, in tab order, under the anchor the tab links to", () => {
    expect(helpSections.slice(0, 5).map(({ id, title }) => [id, title])).toEqual(
      mainDestinations.map(({ helpId, label }) => [helpId, label]),
    );
    expect(helpSections.slice(0, 5).every((section) => section.chip)).toBe(true);
  });

  it("then has Siri and the quick add, and Boenden, without chips", () => {
    expect(helpSections.slice(5).map(({ id, chip }) => [id, chip])).toEqual([
      ["siri", false],
      ["boenden", false],
    ]);
  });

  it("has unique anchors and tips with a title and a text", () => {
    expect(new Set(helpSections.map((section) => section.id)).size).toBe(helpSections.length);
    for (const section of helpSections) {
      expect(section.tips.length).toBeGreaterThan(0);
      for (const tip of section.tips) {
        expect(tip.title.length).toBeGreaterThan(0);
        expect(tip.text.length).toBeGreaterThan(0);
      }
    }
  });
});
