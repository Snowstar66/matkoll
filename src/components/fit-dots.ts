import type { PreferenceNote } from "@/components/preference-notes";

/** One person who stands out for a dish: allergy (red ring and word), avoid (sand) or love (mint). */
export type FitDot = {
  /** The person's name; the notes carry no ids, and two people with the same name are one dot. */
  personId: string;
  name: string;
  initial: string;
  kind: "allergy" | "avoid" | "love";
  /** The sentence for screen readers and for the sheet on the recipe page ("Anna älskar paprika"). */
  label: string;
  /** The allergen words ("Gluten") for an allergy dot; empty for the others. */
  words: readonly string[];
};

const allergyNote = /^Kan innehålla (.+) \((.+)\)$/;
const tasteNote = /^(.+?) (undviker|älskar) (.+)$/;
const kindOrder = { allergy: 0, avoid: 1, love: 2 } as const;

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("sv-SE") + text.slice(1);
const initialOf = (name: string) => capital(name.trim().charAt(0));

/**
 * FitDots data: from the notes of foodFit (the words of src/features/menu-advisor/domain/dish-fit.ts) one dot per
 * person who stands out for the dish, and nobody who is neutral. A person with an allergy is an allergy dot (even if
 * she also avoids something), then avoid, then love. Order: allergy, avoid, love, each in the order of the notes.
 * Empty for a dish that fits everyone, so nothing is shown. `max` cuts the list but never an allergy dot.
 */
export function fitDots(notes: readonly PreferenceNote[] | undefined, max?: number): FitDot[] {
  if (!notes || notes.length === 0) return [];
  const byName = new Map<string, { allergy: string[]; avoid: string[]; love: string[] }>();
  const entry = (name: string) => {
    let found = byName.get(name);
    if (!found) byName.set(name, (found = { allergy: [], avoid: [], love: [] }));
    return found;
  };
  for (const note of notes) {
    if (note.kind === "allergy") {
      const match = allergyNote.exec(note.text);
      if (!match) continue;
      for (const name of match[2].split(", ")) entry(name).allergy.push(match[1]);
    } else {
      const match = tasteNote.exec(note.text);
      if (match) entry(match[1])[match[2] === "undviker" ? "avoid" : "love"].push(note.text);
    }
  }
  const dots: FitDot[] = [];
  for (const [name, found] of byName) {
    const initial = initialOf(name);
    if (found.allergy.length > 0) {
      dots.push({ personId: name, name, initial, kind: "allergy", label: `${name}: kan innehålla ${found.allergy.join(" och ")}`, words: found.allergy.map(capital) });
    } else if (found.avoid.length > 0) {
      dots.push({ personId: name, name, initial, kind: "avoid", label: found.avoid.join(". "), words: [] });
    } else if (found.love.length > 0) {
      dots.push({ personId: name, name, initial, kind: "love", label: found.love.join(". "), words: [] });
    }
  }
  dots.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
  if (max === undefined) return dots;
  const allergies = dots.filter((dot) => dot.kind === "allergy").length;
  return dots.slice(0, Math.max(max, allergies));
}
