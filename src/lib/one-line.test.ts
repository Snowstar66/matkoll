import { describe, expect, it } from "vitest";
import { charLength, normalizeHttpsUrl, oneLine } from "./one-line";

const char = (code: number) => String.fromCodePoint(code);

describe("oneLine", () => {
  it("removes bidi controls and makes control characters, line separators and runs of whitespace one space", () => {
    expect(oneLine(`${char(0x202e)}Arla${char(0x202c)} Matlagningsgrädde${char(0x2066)}${char(0x2069)}`)).toBe(
      "Arla Matlagningsgrädde",
    );
    expect(oneLine(`5${char(0x2028)}dl${char(0x2029)}x`)).toBe("5 dl x");
    expect(oneLine(` 5${char(0x07)}${char(0x85)}  dl\t`)).toBe("5 dl");
  });

  it("gives an empty text for nothing but whitespace and controls", () => {
    expect(oneLine(` \t\n${char(0x202a)}${char(0x2028)}`)).toBe("");
  });
});

describe("normalizeHttpsUrl", () => {
  it("trims and lower-cases the scheme", () => {
    expect(normalizeHttpsUrl(" Https://www.arla.se/produkter ")).toBe("https://www.arla.se/produkter");
  });

  it.each(["arla.se", "http://arla.se", "javascript:alert(1)", "https://", "https:///x", "https://arla.se/a b", `https://arla.se/${char(0x202e)}`])(
    "refuses %s",
    (url) => {
      expect(normalizeHttpsUrl(url)).toBeNull();
    },
  );
});

describe("charLength", () => {
  it("counts code points, as Postgres's char_length", () => {
    expect(charLength("🥛🥛")).toBe(2);
    expect(charLength("grädde")).toBe(6);
  });
});
