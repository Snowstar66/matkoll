import { z } from "zod";

// Store sections, in the order the shopping list groups them (AD-12).

export const SECTIONS = [
  "Frukt och grönt",
  "Bröd",
  "Mejeri",
  "Kött och fisk",
  "Chark",
  "Frys",
  "Skafferi",
  "Dryck",
  "Övrigt",
] as const;

export const sectionSchema = z.enum(SECTIONS);
export type Section = z.infer<typeof sectionSchema>;

/** Composed letters (NFC), lower case, "&" as "och", single spaces. */
export function simplifyLabel(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("sv-SE")
    .replace(/&/g, " och ")
    .replace(/\s+/g, " ")
    .trim();
}

const sectionAliases = new Map<string, Section>([
  ...SECTIONS.map((section) => [simplifyLabel(section), section] as const),
  ["frukt", "Frukt och grönt"],
  ["grönt", "Frukt och grönt"],
  ["grönsaker", "Frukt och grönt"],
  ["frukt och grönsaker", "Frukt och grönt"],
  ["bageri", "Bröd"],
  ["mejerivaror", "Mejeri"],
  ["ost", "Mejeri"],
  ["kött", "Kött och fisk"],
  ["fisk", "Kött och fisk"],
  ["fågel", "Kött och fisk"],
  ["fisk och skaldjur", "Kött och fisk"],
  ["kött och fågel", "Kött och fisk"],
  ["charkuterier", "Chark"],
  ["pålägg", "Chark"],
  ["fryst", "Frys"],
  ["frysvaror", "Frys"],
  ["djupfryst", "Frys"],
  ["torrvaror", "Skafferi"],
  ["kryddor", "Skafferi"],
  ["konserver", "Skafferi"],
  ["bakning", "Skafferi"],
  ["drycker", "Dryck"],
]);

/** The section for a written section; an unknown one is Övrigt. */
export function toSection(raw: string | null | undefined): Section {
  return sectionAliases.get(simplifyLabel(raw)) ?? "Övrigt";
}
