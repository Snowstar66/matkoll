// "En enkel resa": two to three ranked main-course options per person, with the reasons that change a decision.
// Pure, no AI. Built on recommend.ts's ranking (tastes, Undviker, Älskar, budget); never claims a dish is allergy-safe.
import { allergenHits } from "./allergens";
import { allergenLabels } from "./labels";
import type { Choices, DishOption, PersonOptions } from "./options";
import { whoName } from "./preferences";
import { softHits } from "./tastes";
import type { Person } from "./profile";
import { type Budget, rank, rankContext } from "./recommend";
import type { Menu, MenuDish } from "./types";
import { dishSek } from "./view";

export type RecommendOptionsOptions = {
  budget?: Budget;
  /** Options per person; default 3. */
  perPerson?: number;
};

/** What a person with the same best dish as someone before loses in score: less than one step of taste (3), so a clearly better match still wins. */
const spreadPenalty = 2;
/** A price gap under this many kronor is not worth a reason. */
const minSavingSek = 10;

const capital = (text: string) => text.charAt(0).toLocaleUpperCase("sv-SE") + text.slice(1);
const lower = (text: string) => text.toLocaleLowerCase("sv-SE");

/** The dishes proposed as a main course: Varmrätt, or when the menu has none, Förrätt. Drinks, desserts and "Övrigt" never. */
function mainCandidates(menu: Menu): { dish: MenuDish; index: number }[] {
  const indexed = menu.ratter.map((dish, index) => ({ dish, index }));
  const mains = indexed.filter((entry) => entry.dish.grupp === "Varmrätt");
  return mains.length > 0 ? mains : indexed.filter((entry) => entry.dish.grupp === "Förrätt");
}

/** Dishes that can fill the places a thin menu leaves (fewer main courses than options asked for): everything but desserts, drinks and the main courses already there. */
function fillerCandidates(menu: Menu, taken: readonly { index: number }[]): { dish: MenuDish; index: number }[] {
  return menu.ratter.flatMap((dish, index) => (dish.grupp === "Efterrätt" || dish.grupp === "Drycker" || taken.some((entry) => entry.index === index) ? [] : [{ dish, index }]));
}

/** Whether the dish is one of the main courses the options are made of: one per person, so choosing another replaces it. A starter or a dessert next to them is added on top. */
export function isMainCourse(menu: Menu, dishIndex: number): boolean {
  return mainCandidates(menu).some((entry) => entry.index === dishIndex);
}

type Candidate = { dish: MenuDish; index: number; score: number; warning: DishOption["warning"]; reasons: string[]; priceSek: number | null; allergenCount: number };

function candidate(entry: { dish: MenuDish; index: number }, person: Person, ctx: ReturnType<typeof rankContext>): Candidate {
  const ranked = rank(entry.dish, person, ctx);
  const hits = allergenHits(entry.dish, person.allergies);
  const certain = hits.filter((hit) => hit.source === "allergener");
  const warning: DishOption["warning"] = certain.length > 0 ? "allergy" : hits.length > 0 ? "maybe" : null;
  const who = whoName(person);
  const reasons: string[] = [];
  // Every taste the person has says so on the card, the original eight (rött kött, fisk ...) too; the score counts them elsewhere.
  const { avoided, loved } = softHits(person, entry.dish, { withOriginals: true });
  if (loved.length > 0) reasons.push(capital(`${who} älskar ${loved.map(lower).join(", ")}`));
  if (avoided.length > 0) reasons.push(capital(`${who} undviker ${avoided.map(lower).join(", ")}`));
  if (warning === "allergy") reasons.push(`Innehåller ${certain.map((hit) => allergenLabels[hit.allergen].toLocaleLowerCase("sv-SE")).join(", ")}. Fråga personalen.`);
  if (warning === "maybe") reasons.push(`Kan innehålla ${hits.map((hit) => allergenLabels[hit.allergen].toLocaleLowerCase("sv-SE")).join(", ")}. Fråga personalen.`);
  return { dish: entry.dish, index: entry.index, score: ranked.score, warning, reasons, priceSek: dishSek(entry.dish), allergenCount: certain.length };
}

/**
 * For each person, `perPerson` ranked main-course options, best first. A dish with an allergen of the person is
 * flagged in red (warning "allergy", with a reason), never hidden: it goes after the safe dishes and fills the
 * places they leave; when no dish is safe the first option says nothing else fits (never silent). "Kan innehålla"
 * gets warning "maybe" and goes last among the safe ones. No dish twice to one person;
 * the best dish is spread out between people unless it is a clearly better match for them.
 */
export function recommendOptions(menu: Menu, people: readonly Person[], opts: RecommendOptionsOptions = {}): PersonOptions[] {
  const perPerson = Math.max(1, opts.perPerson ?? 3);
  const mains = mainCandidates(menu);
  const ctx = rankContext(mains.map((entry) => entry.dish), opts.budget ?? "normalt");
  const fillers = mains.length < perPerson ? fillerCandidates(menu, mains) : [];
  const taken = new Set<number>();
  return people.map((person): PersonOptions => {
    const all = mains.map((entry) => candidate(entry, person, ctx));
    const safe = all.filter((entry) => entry.warning !== "allergy");
    if (all.length === 0) return { personId: person.id, options: [] };
    // A dish with an allergen of the person is flagged in red, never hidden (Pontus 2026-11-09): it goes after the
    // safe ones, fewest allergens first, and only fills the places the safe dishes leave.
    const flagged = all
      .filter((entry) => entry.warning === "allergy")
      .sort((a, b) => a.allergenCount - b.allergenCount || b.score - a.score || a.index - b.index);
    const picked = safe
      .map((entry) => ({ entry, adjusted: entry.score - (taken.has(entry.index) ? spreadPenalty : 0) }))
      .sort((a, b) => b.adjusted - a.adjusted || a.entry.index - b.entry.index)
      .slice(0, perPerson)
      .map(({ entry }) => entry);
    // A thin menu (few main courses): the places left are filled with the best of the other dishes, after the main courses.
    const extras = fillers
      .map((entry) => candidate(entry, person, ctx))
      .filter((entry) => entry.warning !== "allergy")
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, Math.max(0, perPerson - picked.length));
    const ordered = [...picked, ...extras];
    const fill = flagged.slice(0, Math.max(0, perPerson - ordered.length));
    if (ordered.length === 0) {
      const [first, ...rest] = fill;
      const lone = { ...first!, reasons: ["Inget annat på menyn passar. Den här innehåller en allergen du har, fråga personalen.", ...first!.reasons] };
      return { personId: person.id, options: [toOption(lone, null), ...rest.map((entry) => toOption(entry, null))] };
    }
    taken.add(ordered[0]!.index);
    const lead = ordered[0]!.priceSek;
    return { personId: person.id, options: [...ordered, ...fill].map((entry, position) => toOption(entry, position === 0 ? null : lead)) };
  });
}

function toOption(entry: Candidate, leadSek: number | null): DishOption {
  const reasons = [...entry.reasons];
  if (leadSek !== null && entry.priceSek !== null && leadSek - entry.priceSek >= minSavingSek) reasons.push(`${Math.round(leadSek - entry.priceSek)} kr billigare än förslaget`);
  return { dish: entry.dish, dishIndex: entry.index, priceSek: entry.priceSek, reasons, warning: entry.warning };
}

/**
 * One chosen dish as an option for one person: used when someone adds a dish from the whole menu ("Fler rätter åt Anna").
 * Same reasons and warnings as the ranked options; a dish with an allergen of the person says so in words (never silent).
 * Null when the index is not a dish of the menu.
 */
export function optionFor(menu: Menu, dishIndex: number, person: Person): DishOption | null {
  const dish = menu.ratter[dishIndex];
  if (!dish) return null;
  const ctx = rankContext(mainCandidates(menu).map((entry) => entry.dish), "normalt");
  const entry = candidate({ dish, index: dishIndex }, person, ctx);
  if (entry.warning !== "allergy") return toOption(entry, null);
  const names = allergenHits(dish, person.allergies)
    .filter((hit) => hit.source === "allergener")
    .map((hit) => allergenLabels[hit.allergen].toLocaleLowerCase("sv-SE"));
  return toOption({ ...entry, reasons: [`Innehåller ${names.join(", ")}. Fråga personalen.`] }, null);
}

/** The best option per person: the first without a warning when there is one, else the first. A person without options has no dish. */
export function defaultChoices(options: readonly PersonOptions[]): Choices {
  const choices: Choices = {};
  for (const { personId, options: list } of options) {
    const pick = list.find((option) => option.warning === null) ?? list[0];
    choices[personId] = { dishIndex: pick ? pick.dishIndex : null, drink: null };
  }
  return choices;
}
