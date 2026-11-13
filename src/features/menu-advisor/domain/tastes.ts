import { cleanTag, matchPreference, maxTagLength, normalizeText, parseTags } from "./preferences";
import type { Person, Taste } from "./profile";
import { tasteKeys } from "./profile";

// One system for what a person likes and dislikes ("Smak och allergier"): a two-way slider per thing, from Ogillar via
// Okej to Älskar. The things are presets (grouped, all shown, Okej until touched) and the person's own. Stored as
// Person.tastes (key → -2, -1, 1, 2; Okej is never stored, so nothing filled in = eats anything). The older free
// "Undviker" / "Älskar" lists are folded in as -2 / +2 when a person is read. Pure.

export type TasteItem = { key: string; label: string };
export type TasteGroup = { id: string; title: string; items: readonly TasteItem[] };

/**
 * The presets, as groups. Keys are plain ASCII ids (eight of them are the original TasteKey). "kott" is shown as
 * "Rött kött" since 2026-11-13, when Fläskkött and Kyckling got sliders of their own: the key stays, so what was saved
 * for "Kött" keeps steering beef, lamb and game, and pork and chicken start at Okej (preferences.ts has the words).
 * Köttfärs (with köttbullar) and Blandfärs followed the same day: mince is no longer Rött kött or Fläskkött.
 */
export const tasteGroups: readonly TasteGroup[] = [
  {
    id: "protein",
    title: "Protein",
    items: [
      { key: "kott", label: "Rött kött" },
      { key: "flask", label: "Fläskkött" },
      { key: "kyckling", label: "Kyckling" },
      { key: "kottfars", label: "Köttfärs" },
      { key: "blandfars", label: "Blandfärs" },
      { key: "fisk", label: "Fisk" },
      { key: "skaldjur", label: "Skaldjur" },
      { key: "vegetariskt", label: "Vegetariskt" },
    ],
  },
  {
    id: "ratter",
    title: "Maträtter",
    items: [
      { key: "pasta", label: "Pasta" },
      { key: "pizza", label: "Pizza" },
      { key: "ris", label: "Ris" },
      { key: "soppa", label: "Soppa" },
      { key: "sallad", label: "Sallad" },
      { key: "tacos", label: "Tacos" },
      { key: "burgare", label: "Burgare" },
    ],
  },
  {
    id: "smaker",
    title: "Smaker och råvaror",
    items: [
      { key: "starkt", label: "Starkt" },
      { key: "sott", label: "Sött" },
      { key: "ost", label: "Ost" },
      { key: "svamp", label: "Svamp" },
      { key: "lok", label: "Lök" },
      { key: "vitlok", label: "Vitlök" },
      { key: "koriander", label: "Koriander" },
      { key: "paprika", label: "Paprika" },
      { key: "tomat", label: "Tomat" },
      { key: "oliver", label: "Oliver" },
      { key: "agg", label: "Ägg" },
      { key: "notter", label: "Nötter" },
    ],
  },
];

/** The group of the person's own things. */
export const ownGroup = { id: "egna", title: "Egna" } as const;

const presets = tasteGroups.flatMap((group) => group.items);
const presetLabels: ReadonlyMap<string, string> = new Map(presets.map((item) => [item.key, item.label]));
export const presetKeys: readonly string[] = presets.map((item) => item.key);
const originalKeys: ReadonlySet<string> = new Set(tasteKeys);

/** How many own things one person can have; with the presets they are the most keys a person's tastes can hold. */
export const maxOwnTastes = 40;
export const maxTastes = presets.length + maxOwnTastes;

/** What an own key looks like (also what the database accepts, supabase/migrations/20261110100000_food_tastes_own.sql). */
export const tasteKeyPattern = /^[a-zåäö0-9][a-zåäö0-9 _-]{0,39}$/;

export const isPresetKey = (key: string) => presetLabels.has(key);
/** The eight that a dish's category and word list score directly (recommend.ts). */
export const isOriginalKey = (key: string) => originalKeys.has(key);

/** The name of a thing: the preset's label, or the own key with a capital ("Nasi goreng"). */
export function tasteLabel(key: string): string {
  return presetLabels.get(key) ?? key.charAt(0).toLocaleUpperCase("sv-SE") + key.slice(1);
}

/** The thing in running text ("vitlök", "nasi goreng"): how the notes, the reasons and the AI prompt name it. */
export const tasteWord = (key: string) => tasteLabel(key).toLocaleLowerCase("sv-SE");

/** Older or shorter names that still mean a preset: "kött" was the label of "kott" until 2026-11-13. */
const presetAliases: readonly (readonly [string, string])[] = [
  ["kött", "kott"],
  ["fläsk", "flask"],
  ["nötfärs", "kottfars"],
];
const presetByText: ReadonlyMap<string, string> = new Map([
  ...presets.flatMap((item) => [[normalizeText(item.label), item.key] as const, [item.key, item.key] as const]),
  ...presetAliases.map(([text, key]) => [normalizeText(text), key] as const),
]);

/** The key a typed text stands for: a preset when it names one ("Vitlök" → vitlok), else an own key. Null when there is no usable word. */
export function tasteKeyFor(text: string): string | null {
  if (cleanTag(text) === null) return null;
  const plain = normalizeText(text).replace(/[^a-zåäö0-9 _-]+/g, " ").replace(/\s+/g, " ").replace(/^[ _-]+/, "").trim();
  const preset = presetByText.get(plain);
  if (preset) return preset;
  const key = plain.slice(0, maxTagLength).trim();
  return tasteKeyPattern.test(key) ? key : null;
}

/** Adds an own thing at Okej-to-be-set level: the same checks as the older tags (no markup or web addresses, max 40 characters). */
export function validateOwnTaste(text: string, tastes: Readonly<Record<string, Taste>>, shownKeys: readonly string[]): { key: string | null; error: string | null } {
  const tag = text.replace(/\s+/g, " ").trim();
  if (tag === "") return { key: null, error: null };
  if (tag.length > maxTagLength) return { key: null, error: `Max ${maxTagLength} tecken.` };
  if (cleanTag(tag) === null) return { key: null, error: "Skriv bara ord, inga tecken som < eller {." };
  const key = tasteKeyFor(tag);
  if (key === null) return { key: null, error: "Skriv minst ett ord med bokstäver eller siffror." };
  if (shownKeys.includes(key)) return { key: null, error: "Det finns redan i listan." };
  if (ownKeys(tastes, shownKeys).length >= maxOwnTastes) return { key: null, error: `Max ${maxOwnTastes} egna saker.` };
  return { key, error: null };
}

/** The keys that are not presets, in the order given. */
export const ownKeys = (tastes: Readonly<Record<string, Taste>>, extra: readonly string[] = []) => [...new Set([...Object.keys(tastes), ...extra])].filter((key) => !isPresetKey(key));

/** The tastes from storage (never trusted): known value only, valid keys, no 0, at most maxTastes keys (own ones last). */
export function parseTastes(value: unknown): Record<string, Taste> {
  const out: Record<string, Taste> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) return out;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, Taste] => tasteKeyPattern.test(entry[0]) && (entry[1] === -2 || entry[1] === -1 || entry[1] === 1 || entry[1] === 2),
  );
  const own = entries.filter(([key]) => !isPresetKey(key)).slice(0, maxOwnTastes);
  for (const [key, taste] of [...entries.filter(([key]) => isPresetKey(key)), ...own]) out[key] = taste;
  return out;
}

/** The older free lists folded in: Undviker becomes -2, Älskar +2, never over a value that is already set (Undviker first, so a thing in both is avoided). */
export function foldLegacyTags(tastes: Readonly<Record<string, Taste>>, dislikes: unknown, likes: unknown): Record<string, Taste> {
  const out: Record<string, Taste> = { ...tastes };
  for (const [tags, taste] of [[parseTags(dislikes), -2], [parseTags(likes), 2]] as const) {
    for (const tag of tags) {
      const key = tasteKeyFor(tag);
      if (key === null || key in out || (!isPresetKey(key) && ownKeys(out).length >= maxOwnTastes)) continue;
      out[key] = taste;
    }
  }
  return out;
}

export function withTaste(person: Person, key: string, taste: Taste): Person {
  const tastes = { ...person.tastes };
  if (taste === 0) delete tastes[key];
  else tastes[key] = taste;
  return { ...person, tastes };
}

/** The person's tastes without the eight original ones: the part that is matched by words, not by a dish's category. */
export const wordTastes = (tastes: Readonly<Record<string, Taste>>): [string, Taste][] => Object.entries(tastes).filter(([key]) => !isOriginalKey(key));

/**
 * What a person avoids and loves as plain words, the lists every caller (notes, reasons, AI prompt) has always had:
 * -2 and -1 are "Undviker" (the -2 ones also in `strongDislikes`), 1 and 2 "Älskar" (the 2 ones also in `strongLikes`).
 */
export type TasteLists = { dislikes: string[]; likes: string[]; strongDislikes: string[]; strongLikes: string[] };

export function tasteLists(tastes: Readonly<Record<string, Taste>>, opts: { withOriginals?: boolean } = {}): TasteLists {
  const withOriginals = opts.withOriginals ?? true;
  const lists: TasteLists = { dislikes: [], likes: [], strongDislikes: [], strongLikes: [] };
  const entries = (withOriginals ? Object.entries(tastes) : wordTastes(tastes)).sort((a, b) => order(a[0]) - order(b[0]));
  for (const [key, taste] of entries) {
    const word = tasteWord(key);
    if (taste < 0) {
      lists.dislikes.push(word);
      if (taste === -2) lists.strongDislikes.push(word);
    } else if (taste > 0) {
      lists.likes.push(word);
      if (taste === 2) lists.strongLikes.push(word);
    }
  }
  return lists;
}

const keyOrder = [...presetKeys];
const order = (key: string) => (keyOrder.includes(key) ? keyOrder.indexOf(key) : keyOrder.length);

export const tasteListsOf = (person: Pick<Person, "tastes">, opts?: { withOriginals?: boolean }) => tasteLists(person.tastes, opts);

/** The lists of the preferences a dish is matched against, for a person (what the older SoftFit had). */
export type SoftFit = { person: Person; dislikes: string[]; likes: string[] };

/** For each person with a match, what they avoid and love that the dish has (every thing, the original eight too). */
export function softFitFor(dish: Parameters<typeof matchPreference>[1], company: readonly Person[]): SoftFit[] {
  return company.flatMap((person) => {
    const lists = tasteListsOf(person);
    const dislikes = lists.dislikes.filter((tag) => matchPreference(tag, dish));
    const likes = lists.likes.filter((tag) => matchPreference(tag, dish) && !dislikes.includes(tag));
    return dislikes.length > 0 || likes.length > 0 ? [{ person, dislikes, likes }] : [];
  });
}

/**
 * What a dish says about one person's word-matched tastes (everything but the original eight, which a dish's category
 * and word list score directly in recommend.ts): the avoided and the loved words it has, and how many of each are the
 * strong end. A thing in both lists counts as avoided.
 */
export type SoftHits = { avoided: string[]; loved: string[]; strongAvoided: number; strongLoved: number };

export function softHits(person: Pick<Person, "tastes">, dish: Parameters<typeof matchPreference>[1]): SoftHits {
  const lists = tasteLists(person.tastes, { withOriginals: false });
  const avoided = lists.dislikes.filter((word) => matchPreference(word, dish));
  const loved = lists.likes.filter((word) => matchPreference(word, dish) && !avoided.includes(word));
  return {
    avoided,
    loved,
    strongAvoided: avoided.filter((word) => lists.strongDislikes.includes(word)).length,
    strongLoved: loved.filter((word) => lists.strongLikes.includes(word)).length,
  };
}

/**
 * The sentence at the top of the page: "Anna älskar fisk och paprika. Gillar ris. Undviker vitlök och skaldjur." (the
 * strong ends first, "Hellre inte" and "Ogillar" both as Undviker), or "Inget ifyllt: äter allt".
 */
export function tasteSummary(name: string, tastes: Readonly<Record<string, Taste>>): string {
  const lists = tasteLists(tastes);
  if (lists.dislikes.length + lists.likes.length === 0) return "Inget ifyllt: äter allt";
  const words = (list: readonly string[]) => (list.length <= 1 ? list.join("") : `${list.slice(0, -1).join(", ")} och ${list[list.length - 1]}`);
  const fine = lists.likes.filter((word) => !lists.strongLikes.includes(word));
  const parts: [string, readonly string[]][] = [
    ["älskar", lists.strongLikes],
    ["gillar", fine],
    ["undviker", lists.dislikes],
  ];
  return parts
    .filter(([, list]) => list.length > 0)
    .map(([verb, list], index) => (index === 0 ? `${name} ${verb} ${words(list)}.` : `${verb.charAt(0).toLocaleUpperCase("sv-SE")}${verb.slice(1)} ${words(list)}.`))
    .join(" ");
}
