import { describe, expect, it } from "vitest";
import { saveRecipeShortcutUrl, siriShortcutUrl } from "./phone-shortcuts";

describe("phone shortcut links", () => {
  it("are null or an iCloud shortcut link", () => {
    for (const url of [saveRecipeShortcutUrl, siriShortcutUrl]) {
      if (url !== null) expect(url).toMatch(/^https:\/\/www\.icloud\.com\/shortcuts\//);
    }
  });
});
