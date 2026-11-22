import { describe, expect, it } from "vitest";
import { pageForAnchor, settingsPageHref, settingsPages } from "./settings-routes";

describe("settings pages", () => {
  it("gives every page its own address under /installningar", () => {
    expect(settingsPages.map(settingsPageHref)).toContain("/installningar/telefon");
    expect(new Set(settingsPages).size).toBe(settingsPages.length);
  });

  it("keeps every old page and has Avancerat besides them, so no address stops working", () => {
    expect(settingsPages).toEqual(expect.arrayContaining(["receptsajter", "ai", "tillval", "appikon", "avancerat"]));
    expect(settingsPageHref("avancerat")).toBe("/installningar/avancerat");
  });

  it("sends the old anchors to the page that holds them now", () => {
    expect(pageForAnchor("#spara-i-matkoll")).toBe("telefon");
    expect(pageForAnchor("#godkanda-receptsajter")).toBe("receptsajter");
    expect(pageForAnchor("#ai")).toBe("ai");
    expect(pageForAnchor("#unknown")).toBeNull();
    expect(pageForAnchor("")).toBeNull();
  });
});
