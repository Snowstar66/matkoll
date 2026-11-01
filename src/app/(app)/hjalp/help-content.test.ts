import { describe, expect, it } from "vitest";
import { mainDestinations } from "@/components/app-shell/destinations";
import { areaFromHash, fold, helpAreas, highlightParts, searchHelp } from "./help-content";

describe("helpAreas", () => {
  it("has one area per tab, in tab order, under the anchor the tab links to, and then Konto", () => {
    expect(helpAreas.slice(0, 5).map(({ id, title }) => [id, title])).toEqual(mainDestinations.map(({ helpId, label }) => [helpId, label]));
    expect(helpAreas.map((area) => area.title)).toEqual(["Recept", "Matsedel", "Inköpslista", "Matvaror", "Förråd", "Konto"]);
  });

  it("has three steps and some questions per area, each with a title and a text, and no title twice", () => {
    expect(new Set(helpAreas.map((area) => area.id)).size).toBe(helpAreas.length);
    for (const area of helpAreas) {
      expect(area.steps).toHaveLength(3);
      expect(area.faq.length).toBeGreaterThanOrEqual(3);
      for (const step of area.steps) expect(step.title && step.text).toBeTruthy();
      for (const item of area.faq) expect(item.question.endsWith("?") && item.answer.length > 0).toBe(true);
      const titles = [...area.steps.map((step) => step.title), ...area.faq.map((item) => item.question)];
      expect(new Set(titles).size).toBe(titles.length);
    }
  });

  it("lets Konto take over Siri, the quick add, Boenden and who sees the data", () => {
    const konto = JSON.stringify(helpAreas.find((area) => area.id === "konto"));
    for (const fact of ["Siri och genvägar", "/lista/lagg-till", "Inställningar, Boenden", "tekniskt se kontots data"]) expect(konto).toContain(fact);
  });
});

describe("areaFromHash", () => {
  it("is the area the address names, else Recept", () => {
    expect(areaFromHash("#matvaror")).toBe("matvaror");
    expect(areaFromHash("#konto")).toBe("konto");
    expect(areaFromHash("")).toBe("recept");
    expect(areaFromHash("#siri")).toBe("recept");
  });
});

describe("searchHelp", () => {
  it("folds case and å/ä/ö one character for one", () => {
    expect(fold("Öppna Kylen Å")).toBe("oppna kylen a");
    expect(fold("Öppna").length).toBe("Öppna".length);
  });

  it("finds steps and questions in every area without caring about å/ä/ö or capitals", () => {
    const hits = searchHelp("KYL");
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.map((hit) => hit.area.id)).toContain("matvaror");
    expect(searchHelp("forrad").some((hit) => hit.title === "Ska maten in här?")).toBe(true);
    expect(searchHelp("lagg pa matsedeln").map((hit) => hit.title)).toContain("Hur lägger jag ett recept på matsedeln?");
    expect(searchHelp("Siri").every((hit) => ["inkopslista", "konto"].includes(hit.area.id))).toBe(true);
  });

  it("finds nothing for a word that is nowhere, or for no word", () => {
    expect(searchHelp("zebrafink")).toEqual([]);
    expect(searchHelp("   ")).toEqual([]);
  });
});

describe("highlightParts", () => {
  it("marks every place a searched word stands, in the text's own letters", () => {
    expect(highlightParts("Öppna kylen, töm kylen", "KYL")).toEqual([
      { text: "Öppna ", match: false },
      { text: "kyl", match: true },
      { text: "en, töm ", match: false },
      { text: "kyl", match: true },
      { text: "en", match: false },
    ]);
    expect(highlightParts("Förråd", "forr")).toEqual([
      { text: "Förr", match: true },
      { text: "åd", match: false },
    ]);
  });
});
