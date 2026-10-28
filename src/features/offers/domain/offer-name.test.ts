import { describe, expect, it } from "vitest";
import { clip, isNamed, offerName } from "./offer-name";

describe("offerName", () => {
  it("gives the label as the store wrote it, without ®, and the catalog names of each item", () => {
    expect(offerName({ brand: "Gårdens", name: "Herrgård®, Präst®" })).toEqual({
      label: "Gårdens Herrgård, Präst",
      candidates: ["herrgård präst", "herrgård", "präst"],
      fallback: "herrgård",
    });
  });

  it("matches a single item by its whole name", () => {
    expect(offerName({ brand: "Havets", name: "Laxfilé" })).toEqual({
      label: "Havets Laxfilé",
      candidates: ["laxfilé"],
      fallback: "laxfilé",
    });
  });

  it.each([
    ["Lussekatter/Saffransgifflar", ["lussekatter/saffransgifflar", "lussekatter", "saffransgifflar"]],
    ["Potatisgratäng eller rotfruktsgratäng", ["potatisgratäng eller rotfruktsgratäng", "potatisgratäng", "rotfruktsgratäng"]],
    ["Ost och kex", ["ost och kex", "ost", "kex"]],
  ])("divides %s into its items", (name, candidates) => {
    expect(offerName({ brand: "", name }).candidates).toEqual(candidates);
  });

  it("leaves out amounts", () => {
    expect(offerName({ brand: "Polarbröd", name: "Frönuftig/Rågkusar 6-pack" }).candidates).toEqual([
      "frönuftig/rågkusar",
      "frönuftig",
      "rågkusar",
    ]);
    expect(offerName({ brand: "", name: "Grädde ca 700 g" }).candidates).toEqual(["grädde"]);
    expect(offerName({ brand: "", name: "Korv 4-p" }).candidates).toEqual(["korv"]);
  });

  it("leaves the origin out of the brand, and does not write a brand twice", () => {
    expect(offerName({ brand: "Kronfågel. Ursprung Sverige", name: "Färsk kycklingfilé" }).label).toBe(
      "Kronfågel Färsk kycklingfilé",
    );
    expect(offerName({ brand: "Jätten", name: "Jätten" }).label).toBe("Jätten");
    expect(offerName({ brand: "Arla", name: "Arla Mellanmjölk" })).toMatchObject({ label: "Arla Mellanmjölk", fallback: "mellanmjölk" });
  });

  it("keeps the label to 120 and the names to 100 characters", () => {
    const long = offerName({ brand: "Märket", name: "a".repeat(200) });
    expect([...long.label]).toHaveLength(120);
    expect(long.label.endsWith("…")).toBe(true);
    expect([...long.fallback].length).toBeLessThanOrEqual(100);
  });

  it("always gives a fallback name, also for a name that normalises to nothing", () => {
    expect(offerName({ brand: "", name: "2 st" }).fallback).not.toBe("");
  });
});

describe("clip", () => {
  it("cuts at the limit with an ellipsis, and leaves shorter text alone", () => {
    expect(clip("abc", 3)).toBe("abc");
    expect(clip("abcd", 3)).toBe("ab…");
  });
});

describe("isNamed", () => {
  it("is false for an offer with nothing left of its label once cleaned", () => {
    expect(isNamed(offerName({ brand: "\u00ae", name: "\u2122 \u00a9" }))).toBe(false);
    expect(isNamed(offerName({ brand: "", name: "\u00ae" }))).toBe(false);
  });

  it("is true for an offer with a label and a name", () => {
    expect(isNamed(offerName({ brand: "Arla", name: "Mellanmjölk" }))).toBe(true);
    // Only an amount: the label is there and the fallback comes from it.
    expect(isNamed(offerName({ brand: "", name: "500 g" }))).toBe(true);
  });
});
