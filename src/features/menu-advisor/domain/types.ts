// The menu as the advisor works with it. Field names follow the reading (Swedish), as the prompt and the schema do.

export const menuAllergens = ["gluten", "laktos", "notter", "skaldjur", "agg", "fisk", "soja", "sesam"] as const;
export type MenuAllergen = (typeof menuAllergens)[number];

export const menuCategories = ["kott", "fisk", "skaldjur", "vegetariskt", "veganskt", "ej_tillampligt"] as const;
export type MenuCategory = (typeof menuCategories)[number];

export const menuGroups = ["Förrätt", "Varmrätt", "Efterrätt", "Drycker", "Övrigt"] as const;
export type MenuGroup = (typeof menuGroups)[number];

export type MenuDish = {
  originalnamn: string;
  /** The name in Swedish when the menu is in another language; empty or missing when the name is already Swedish. */
  svenskt_namn?: string;
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

/** One dish explained in Swedish ("Mer om rätten"): every text is plain sentences, and one that does not apply is empty. */
export type DishExplanation = {
  svenskt_namn: string;
  beskrivning: string;
  smak_och_storlek: string;
  ursprung: string;
  osakert: string;
};

export type Menu = {
  restaurang: string | null;
  sprak: "sv" | "en" | "es" | "annat";
  ratter: MenuDish[];
  osakert: string[];
  /** A menu read from several photos: the pages (1 = the first photo) that could not be read at all. Missing or empty when every page was read. */
  olasbara_sidor?: number[];
};

/** A reading as the AI port answers it: before normalizeMenu. */
export type RawMenu = Omit<Menu, "ratter"> & {
  /** The currency symbol as printed on the menu ("€", "kr", "£", "$"), or null when none is seen. */
  valutasymbol_pa_menyn: string | null;
  ratter: MenuDish[];
};
