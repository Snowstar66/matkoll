import { z } from "zod";
import { simplifyLabel, type Section } from "./sections";

// Where an ingredient is kept at home (AD-12).

export const LOCATIONS = ["Kyl", "Frys", "Skafferi"] as const;

export const locationSchema = z.enum(LOCATIONS);
export type Location = z.infer<typeof locationSchema>;

const locationAliases = new Map<string, Location>([
  ...LOCATIONS.map((location) => [simplifyLabel(location), location] as const),
  ["kylen", "Kyl"],
  ["kylskåp", "Kyl"],
  ["kylskåpet", "Kyl"],
  ["frysen", "Frys"],
  ["frysbox", "Frys"],
  ["frysboxen", "Frys"],
  ["frysskåp", "Frys"],
  ["frysskåpet", "Frys"],
  ["skafferiet", "Skafferi"],
  ["torrvaror", "Skafferi"],
  ["skåp", "Skafferi"],
  ["skåpet", "Skafferi"],
]);

const sectionLocations = new Map<Section, Location>([
  ["Mejeri", "Kyl"],
  ["Kött och fisk", "Kyl"],
  ["Chark", "Kyl"],
  ["Frys", "Frys"],
]);

/**
 * The location for a written location. An unknown one follows the section:
 * Mejeri, Kött och fisk and Chark → Kyl, Frys → Frys, otherwise Skafferi.
 */
export function toLocation(raw: string | null | undefined, section: Section): Location {
  return locationAliases.get(simplifyLabel(raw)) ?? sectionLocations.get(section) ?? "Skafferi";
}
