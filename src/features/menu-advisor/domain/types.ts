// The menu as the advisor works with it. Field names follow the reading (Swedish), as the prompt and the schema do.

export const menuAllergens = ["gluten", "laktos", "notter", "skaldjur", "agg", "fisk", "soja", "sesam"] as const;
export type MenuAllergen = (typeof menuAllergens)[number];

export const menuCategories = ["kott", "fisk", "skaldjur", "vegetariskt", "veganskt", "ej_tillampligt"] as const;
export type MenuCategory = (typeof menuCategories)[number];

export const menuGroups = ["Förrätt", "Varmrätt", "Efterrätt", "Drycker", "Övrigt"] as const;
export type MenuGroup = (typeof menuGroups)[number];

export type MenuDish = {
  originalnamn: string;
  grupp: MenuGroup;
  forklaring: string;
  huvudingredienser: string[];
  kategori: MenuCategory;
  allergener: MenuAllergen[];
  kan_innehalla: MenuAllergen[];
  pris: number | null;
  /** ISO-like code (SEK, EUR, GBP, USD); null when there is no price. */
  valuta: string | null;
};

export type Menu = {
  restaurang: string | null;
  sprak: "sv" | "en" | "es" | "annat";
  ratter: MenuDish[];
  osakert: string[];
};

/** A reading as the AI port answers it: before normalizeMenu. */
export type RawMenu = Omit<Menu, "ratter"> & {
  /** The currency symbol as printed on the menu ("€", "kr", "£", "$"), or null when none is seen. */
  valutasymbol_pa_menyn: string | null;
  ratter: MenuDish[];
};
