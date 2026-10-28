import { describe, expect, it } from "vitest";
import { rgbToHex, themeColors } from "@/app/theme-colors";

// rgbToHex gives the manifest light mode's bg as hex (Story 11.6). Here, not
// next to the code, since src/ may hold colour values only in globals.css and
// theme-colors.ts (no-hex.test.ts).

describe("rgbToHex", () => {
  it("turns theme-color's rgb() into an upper-case hex colour", () => {
    expect(rgbToHex(themeColors.light)).toBe("#F5F7F4");
    expect(rgbToHex("rgb(0 9 255)")).toBe("#0009FF");
  });

  it.each(["#F5F7F4", "rgb(256 0 0)", "rgb(1, 2, 3)", "rgba(1 2 3 / 50%)"])("refuses %s", (value) => {
    expect(() => rgbToHex(value)).toThrow("Not an rgb() colour");
  });
});
