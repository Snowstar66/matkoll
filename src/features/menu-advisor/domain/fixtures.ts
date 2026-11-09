// Test fixtures for the advisor's domain tests.
import type { Person } from "./profile";
import type { Menu, MenuDish } from "./types";

export const dish = (patch: Partial<MenuDish> = {}): MenuDish => ({
  originalnamn: "Pollo",
  grupp: "Varmrätt",
  forklaring: "Kyckling.",
  huvudingredienser: [],
  kategori: "kott",
  allergener: [],
  kan_innehalla: [],
  pris: 150,
  valuta: "SEK",
  ...patch,
});

export const person = (patch: Partial<Person> = {}): Person => ({ id: "p1", name: "Anna", kind: "member", allergies: [], tastes: {}, drink: null, ...patch });

export const menuOf = (ratter: MenuDish[]): Menu => ({ restaurang: "Casa Pepe", sprak: "es", ratter, osakert: [] });
