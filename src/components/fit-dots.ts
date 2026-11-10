import type { PreferenceNote } from "@/components/preference-notes";

/** One person who stands out for a dish: allergy (red ring and word), avoid (sand) or love (mint). */
export type FitDot = {
  /** The person's key (the name for a note made without keys); one dot per id. */
  personId: string;
  name: string;
  initial: string;
  kind: "allergy" | "avoid" | "love";
  /** The sentence for screen readers and for the sheet on the recipe page ("Anna älskar paprika"). */
  label: string;
  /** The allergen words ("Gluten") for an allergy dot; empty for the others. */
  words: readonly string[];
};

const kindOrder = { allergy: 0, avoid: 1, love: 2 } as const;

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("sv-SE") + text.slice(1);
const initialOf = (name: string) => capital(name.trim().charAt(0));

/**
 * FitDots data: from the structured fields of the notes (people, terms; made by foodFit in src/features/menu-advisor/domain/dish-fit.ts) one dot per
 * person who stands out for the dish, and nobody who is neutral. A person with an allergy is an allergy dot (even if
 * she also avoids something), then avoid, then love. Order: allergy, avoid, love, each in the order of the notes.
 * Empty for a dish that fits everyone, so nothing is shown. `max` cuts the list but never an allergy dot.
 */
export function fitDots(notes: readonly PreferenceNote[] | undefined, max?: number): FitDot[] {
  if (!notes || notes.length === 0) return [];
  const byPerson = new Map<string, { name: string; allergy: string[]; avoid: PreferenceNote[]; love: PreferenceNote[] }>();
  const entry = (person: { id: string; name: string }) => {
    let found = byPerson.get(person.id);
    if (!found) byPerson.set(person.id, (found = { name: person.name, allergy: [], avoid: [], love: [] }));
    return found;
  };
  for (const note of notes) {
    for (const person of note.people ?? []) {
      if (note.kind === "allergy") entry(person).allergy.push(...(note.terms ?? []));
      else entry(person)[note.kind === "dislike" ? "avoid" : "love"].push(note);
    }
  }
  const dots: FitDot[] = [];
  for (const [personId, found] of byPerson) {
    const { name } = found;
    const initial = initialOf(name);
    if (found.allergy.length > 0) {
      dots.push({ personId, name, initial, kind: "allergy", label: `${name}: kan innehålla ${found.allergy.join(" och ")}`, words: found.allergy.map(capital) });
    } else if (found.avoid.length > 0) {
      dots.push({ personId, name, initial, kind: "avoid", label: found.avoid.map((note) => note.text).join(". "), words: [] });
    } else if (found.love.length > 0) {
      dots.push({ personId, name, initial, kind: "love", label: found.love.map((note) => note.text).join(". "), words: [] });
    }
  }
  dots.sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind]);
  if (max === undefined) return dots;
  const allergies = dots.filter((dot) => dot.kind === "allergy").length;
  return dots.slice(0, Math.max(max, allergies));
}
