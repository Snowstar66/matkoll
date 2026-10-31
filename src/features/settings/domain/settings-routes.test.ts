import { describe, expect, it } from "vitest";
import { pageForAnchor, settingsPageHref, settingsPages } from "./settings-routes";

describe("settings pages", () => {
  it("gives every page its own address under /installningar", () => {
    expect(settingsPages.map(settingsPageHref)).toContain("/installningar/spara-i-matkoll");
    expect(new Set(settingsPages).size).toBe(settingsPages.length);
  });

  it("sends the old anchors to the page that holds them now", () => {
    expect(pageForAnchor("#spara-i-matkoll")).toBe("spara-i-matkoll");
    expect(pageForAnchor("#godkanda-receptsajter")).toBe("receptsajter");
    expect(pageForAnchor("#ai")).toBe("ai");
    expect(pageForAnchor("#unknown")).toBeNull();
    expect(pageForAnchor("")).toBeNull();
  });
});
