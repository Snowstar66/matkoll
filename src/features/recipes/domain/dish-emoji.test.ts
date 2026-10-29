import { describe, expect, it } from "vitest";
import { defaultDishEmoji, dishEmoji, offerSavedText } from "./dish-emoji";

describe("dishEmoji", () => {
  it.each([
    ["Lax med dillpotatis", "🐟"],
    ["Fiskgryta", "🐟"],
    ["Kyckling med ris", "🍗"],
    ["Falukorv med stuvade makaroner", "🌭"],
    ["Köttfärssås", "🥩"],
    ["Pasta carbonara", "🍝"],
    ["Ris med grönsaker", "🍚"],
    ["Tomatsoppa", "🍲"],
    ["Tacos", "🌮"],
    ["Potatisgratäng", "🥔"],
    ["Vegetarisk bowl", "🥗"],
    ["Husmanskost", defaultDishEmoji],
  ])("%s is %s", (title, emoji) => {
    expect(dishEmoji(title)).toBe(emoji);
  });
});

describe("offerSavedText", () => {
  it("lists the offers", () => {
    expect(offerSavedText(["falukorv", "ketchup"])).toBe("Sparad från veckans erbjudanden: falukorv, ketchup");
  });
  it("is null without offers", () => {
    expect(offerSavedText([])).toBeNull();
    expect(offerSavedText(undefined)).toBeNull();
  });
});
