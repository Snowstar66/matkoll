import { describe, expect, it } from "vitest";
import { storeBadgeText, storeBadgeTone } from "./store-badge";

describe("storeBadgeText", () => {
  it.each([
    ["Maxi ICA Stormarknad Östersund", "Maxi"],
    ["maxi ica stormarknad", "Maxi"],
    ["ICA Kvantum Krokom", "Krokom"],
    ["ICA Nära Frösön", "Frösön"],
    ["ICA Supermarket Östersund Centrum", "Östersund"],
    ["Matkoll Testbutik", "Matkoll"],
    ["Willys Östersund", "Östersund"],
  ])("%s → %s", (name, text) => {
    expect(storeBadgeText(name)).toBe(text);
  });

  it("falls back to the first word when every word is a chain word, and cuts a long place name", () => {
    expect(storeBadgeText("ICA Kvantum")).toBe("ICA");
    expect(storeBadgeText("Kungsängsmarknadsplatsen")).toBe("Kungsängsma…");
    expect(storeBadgeText("   ")).toBe("Butik");
  });
});

describe("storeBadgeTone", () => {
  it("gives ICA its own colour and every other chain the neutral one", () => {
    expect(storeBadgeTone("ICA")).toBe("ica");
    expect(storeBadgeTone("Willys")).toBe("other");
    expect(storeBadgeTone("Annan")).toBe("other");
  });
});
