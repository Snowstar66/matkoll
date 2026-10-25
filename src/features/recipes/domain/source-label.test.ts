import { describe, expect, it } from "vitest";
import { sourceLabel } from "./source-label";

describe("sourceLabel", () => {
  it("shows a link's host name without www.", () => {
    expect(sourceLabel("url", "https://www.koket.se/kramig-kycklinggryta")).toBe("koket.se");
    expect(sourceLabel("url", "https://tasteline.com/recept/linssoppa/?a=1")).toBe("tasteline.com");
    expect(sourceLabel("url", "http://WWW.Arla.se/recept")).toBe("arla.se");
  });

  it("keeps other sub-domains", () => {
    expect(sourceLabel("url", "https://recept.www.example.se/x")).toBe("recept.www.example.se");
  });

  it("names the other sources", () => {
    expect(sourceLabel("text", null)).toBe("Inklistrad text");
    expect(sourceLabel("photo", null)).toBe("Foto av kokbok");
    expect(sourceLabel("ai", null)).toBe("AI-förslag");
  });

  it("says Länk for a link it cannot read", () => {
    expect(sourceLabel("url", null)).toBe("Länk");
    expect(sourceLabel("url", "inte en adress")).toBe("Länk");
  });
});
