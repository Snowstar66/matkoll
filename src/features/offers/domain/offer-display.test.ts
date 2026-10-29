import { describe, expect, it } from "vitest";
import { offerDetailText, offerDisplay, offerSpokenName } from "./offer-display";

describe("offerDisplay", () => {
  it("takes the brand marker and the country off the front and keeps them as extras", () => {
    expect(offerDisplay("ICA. Spanien Aubergine")).toEqual({ title: "Aubergine", extras: ["ICA", "Spanien"] });
    expect(offerDisplay("ICA. Nederländerna/Belgien Jordgubbar i ask")).toEqual({
      title: "Jordgubbar i ask",
      extras: ["ICA", "Nederländerna/Belgien"],
    });
    expect(offerDisplay("KRAV. Sverige Ekologiska böngroddar i ask")).toEqual({
      title: "Ekologiska böngroddar i ask",
      extras: ["KRAV", "Sverige"],
    });
    expect(offerDisplay("ICA Basic Mjölk")).toEqual({ title: "Basic Mjölk", extras: ["ICA"] });
    expect(offerDisplay("Italien och Spanien Klementiner")).toEqual({ title: "Klementiner", extras: ["Italien/Spanien"] });
  });

  it("takes a producer brand off in any letter case (Story 16.9)", () => {
    expect(offerDisplay("Scan Falukorv")).toEqual({ title: "Falukorv", extras: ["Scan"] });
    expect(offerDisplay("scan falukorv")).toEqual({ title: "Falukorv", extras: ["Scan"] });
    expect(offerDisplay("ICA. Sverige scan falukorv").title).toBe("Falukorv");
  });

  it("leaves other labels, and labels with nothing left, as they are", () => {
    expect(offerDisplay("Gårdens Herrgård, Präst")).toEqual({ title: "Gårdens Herrgård, Präst", extras: [] });
    expect(offerDisplay("ICA. Spanien")).toEqual({ title: "ICA. Spanien", extras: [] });
    expect(offerDisplay("Icakaka")).toEqual({ title: "Icakaka", extras: [] });
    expect(offerDisplay("Sverigefrukt Äpple")).toEqual({ title: "Sverigefrukt Äpple", extras: [] });
  });
});

describe("offerDetailText and offerSpokenName", () => {
  it("puts the extras, Stammis, the note and a late last day on the small line, without price or saving", () => {
    expect(
      offerDetailText(
        { label: "ICA. Spanien Aubergine", memberOnly: true, note: "Max 2 köp/hushåll", validTo: "2026-11-22" },
        "2026-10-26",
      ),
    ).toBe("ICA · Spanien · Stammis · Max 2 köp/hushåll · t.o.m. 22 nov");
    expect(offerDetailText({ label: "Mjölk", memberOnly: false, note: null, validTo: "2026-11-01" }, "2026-10-26")).toBe("");
  });

  it("reads naturally", () => {
    expect(offerSpokenName({ label: "ICA. Spanien Aubergine", price: "12 kr/st", savingPercent: 20 })).toBe(
      "Aubergine, 12 kr per st, spara 20 %",
    );
    expect(offerSpokenName({ label: "Mjölk", price: null, savingPercent: null })).toBe("Mjölk");
  });
});
