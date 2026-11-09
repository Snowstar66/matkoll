import type { MenuAllergen, MenuCategory, Menu } from "./types";

/** Swedish names of the allergens, as the chips and tags say them. */
export const allergenLabels: Readonly<Record<MenuAllergen, string>> = {
  gluten: "Gluten",
  laktos: "Laktos",
  notter: "Nötter",
  skaldjur: "Skaldjur",
  agg: "Ägg",
  fisk: "Fisk",
  soja: "Soja",
  sesam: "Sesam",
};

/** A glyph for the chips (decoration; the name is always beside it). */
export const allergenIcons: Readonly<Partial<Record<MenuAllergen, string>>> = {
  gluten: "🌾",
  laktos: "🥛",
  notter: "🥜",
  skaldjur: "🦐",
  agg: "🥚",
  fisk: "🐟",
  soja: "🫘",
};

/** The tag for a dish's category; none for a drink or anything the reading could not place. */
export const categoryTags: Readonly<Record<MenuCategory, string | null>> = {
  kott: "kött",
  fisk: "fisk",
  skaldjur: "skaldjur",
  vegetariskt: "vegetariskt",
  veganskt: "veganskt",
  ej_tillampligt: null,
};

const languageNames: Readonly<Record<Menu["sprak"], string>> = {
  sv: "svenska",
  en: "engelska",
  es: "spanska",
  annat: "ett annat språk",
};

export function languageName(language: Menu["sprak"]): string {
  return languageNames[language];
}
