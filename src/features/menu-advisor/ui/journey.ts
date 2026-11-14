// The logic of "En enkel resa" that lives in the UI layer: what is chosen, what it adds up to, how a reason or a
// reading is worded. Pure, so it is tested without a screen.
import { drinkLabels } from "../domain/people";
import { allergenLabels } from "../domain/labels";
import { toSek } from "../domain/currency";
import { drinkPrice, type Totals } from "../domain/drinks";
import type { Choice, Choices, DishOption, PersonOptions } from "../domain/options";
import type { DrinkKind, Person } from "../domain/profile";
import type { Menu, MenuDish } from "../domain/types";
import { languageName } from "../domain/labels";
import type { MenuReader, MenuStreamEvent } from "../domain/reading";
import { dishSek } from "../domain/view";
import { allergenHits } from "../domain/allergens";

/** "ca 253 kr", or an empty text when there is no price. */
export function approxKr(sek: number | null): string {
  return sek === null ? "" : `ca ${Math.round(sek)} kr`;
}

/** The price a menu row shows: "88 kr" when printed in kronor, else about so many kronor ("ca 197 kr"); empty without a price. */
export function listPrice(dish: Pick<MenuDish, "pris" | "valuta">): string {
  if (dish.pris === null || !Number.isFinite(dish.pris)) return "";
  const currency = dish.valuta?.trim().toUpperCase() ?? null;
  if (currency === null || currency === "SEK") return `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 2 }).format(dish.pris)} kr`;
  const sek = toSek(dish.pris, currency);
  return sek === null ? "" : approxKr(sek);
}

/** Who a name is said as: "Du", "Anna". */
export const nameOf = (person: Pick<Person, "name">) => person.name;

/** "Du", "Du och Anna", "Du, Anna och Gunnar". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/** The line under the total when dishes have no price: "2 rätter saknar pris och räknas inte med"; null when all have one. */
export function unpricedNote(totals: Pick<Totals, "unpriced">): string | null {
  if (totals.unpriced <= 0) return null;
  return `${totals.unpriced} ${totals.unpriced === 1 ? "rätt saknar" : "rätter saknar"} pris och räknas inte med`;
}

/** Whether anything is filled in for the person that could steer or warn: allergies and tastes (Undviker and Älskar are tastes). */
export function hasProfileInfo(person: Pick<Person, "allergies" | "tastes">): boolean {
  return person.allergies.length + Object.keys(person.tastes).length > 0;
}

/** The drink as "med öl"; "utan dryck" for none; empty when the person has no drink set. */
export function drinkPhrase(kind: DrinkKind | null): string {
  if (kind === null) return "";
  if (kind === "ingen") return "utan dryck";
  return `med ${{ vatten: "vatten", lask: "läsk", ol: "öl", vin: "vin", cocktail: "cocktail", kaffe: "kaffe" }[kind]}`;
}

/** The drink counted for a person: the one chosen here, else the person's usual. */
export function drinkFor(person: Person, choices: Choices): DrinkKind | null {
  return choices[person.id]?.drink ?? person.drink;
}

/** "Anna", and "dig" for Du: who something is added for ("Lägg till åt dig"). */
export const toWhom = (person: Pick<Person, "name">) => (person.name === "Du" ? "dig" : person.name);

/** One person's choice changed in one or two fields; everything else (extras, added drinks) stays as it was. */
function patch(choices: Choices, personId: string, change: Partial<Choice>): Choices {
  const current: Choice = choices[personId] ?? { dishIndex: null, drink: null };
  const next: Choice = { ...current, ...change };
  if (next.extras?.length === 0) delete next.extras;
  if (next.drinks?.length === 0) delete next.drinks;
  return { ...choices, [personId]: next };
}

/** One tap on a card: this is the person's proposed dish (the drinks and the dishes added on top stay; a dish that was added is now this one). */
export function choose(choices: Choices, personId: string, dishIndex: number): Choices {
  return patch(choices, personId, {
    dishIndex,
    extras: choices[personId]?.extras?.filter((index) => index !== dishIndex),
  });
}

/** Takes the proposed dish away (the soptunna on it); what was added on top stays. */
export function clearDish(choices: Choices, personId: string): Choices {
  return patch(choices, personId, { dishIndex: null });
}

/** Takes the usual drink away for this evening ("utan dryck"); drinks added on top stay. */
export function dropUsualDrink(choices: Choices, personId: string): Choices {
  return patch(choices, personId, { drink: "ingen" });
}

/** "Utan dryck": the usual drink and every added one are gone for this evening. */
export function dropAllDrinks(choices: Choices, personId: string): Choices {
  return patch(choices, personId, { drink: "ingen", drinks: [] });
}

/** Whether the person ends up with no drink at all: the usual one is taken away or never set, and none was added. */
export function hasNoDrink(choices: Choices, person: Person): boolean {
  const usual = drinkFor(person, choices);
  return (usual === null || usual === "ingen") && (choices[person.id]?.drinks ?? []).length === 0;
}

/** One more drink for the person, last; nothing changes when it is already added. */
export function addDrink(choices: Choices, personId: string, drink: DrinkKind): Choices {
  const current = choices[personId]?.drinks ?? [];
  if (current.includes(drink)) return choices;
  return patch(choices, personId, { drinks: [...current, drink] });
}

/** An added drink taken away again. */
export function removeDrink(choices: Choices, personId: string, drink: DrinkKind): Choices {
  const current = choices[personId]?.drinks ?? [];
  if (!current.includes(drink)) return choices;
  return patch(choices, personId, {
    drinks: current.filter((kind) => kind !== drink),
  });
}

/** Whether the person has the drink already: the usual one that still counts, or an added one. */
export function hasDrink(choices: Choices, person: Person, drink: DrinkKind): boolean {
  const usual = drinkFor(person, choices);
  return (usual === drink && usual !== "ingen") || (choices[person.id]?.drinks ?? []).includes(drink);
}

/** Whether the person already has the dish: as the proposed one or as one added on top. */
export function hasDish(choices: Choices, personId: string, dishIndex: number): boolean {
  const current = choices[personId];
  return current?.dishIndex === dishIndex || (current?.extras ?? []).includes(dishIndex);
}

/** A dish added on top for the person, last: the menu grows. Nothing changes when the person already has it. */
export function addExtra(choices: Choices, personId: string, dishIndex: number): Choices {
  if (hasDish(choices, personId, dishIndex)) return choices;
  return patch(choices, personId, {
    extras: [...(choices[personId]?.extras ?? []), dishIndex],
  });
}

/** A dish added on top, taken away again. */
export function removeExtra(choices: Choices, personId: string, dishIndex: number): Choices {
  if (!choices[personId]?.extras?.includes(dishIndex)) return choices;
  return patch(choices, personId, {
    extras: choices[personId]!.extras!.filter((index) => index !== dishIndex),
  });
}

/** One tap on a drink in the old single-drink flow: this drink replaces the usual one. */
export function chooseDrink(choices: Choices, personId: string, drink: DrinkKind): Choices {
  return patch(choices, personId, { drink });
}

/** What a person lands on with this dish: the dish plus their drink, in kronor; null when the dish has no price (the drink alone is not a price). */
export function cardSek(menu: Menu, dish: MenuDish, drink: DrinkKind | null): number | null {
  const sek = dishSek(dish);
  if (sek === null) return null;
  return sek + (drink === null ? 0 : drinkPrice(menu, drink).sek);
}

/** One line of a person's part of the nota: a dish or a drink with its price in kronor, null when the dish has none. */
export type ReceiptLine = {
  key: string;
  kind: "dish" | "drink";
  label: string;
  sek: number | null;
};

/** What a person has, in the order the card shows it, as the lines the sum is made of (the usual drink counts only with a dish, as in the total). */
export function receiptLines(menu: Menu, person: Person, choices: Choices): ReceiptLine[] {
  const choice = choices[person.id];
  const dishes = [choice?.dishIndex ?? null, ...(choice?.extras ?? [])].flatMap((index) => {
    const dish = index === null ? undefined : menu.ratter[index];
    return dish && index !== null
      ? [
          {
            key: `dish-${index}`,
            kind: "dish" as const,
            label: dish.originalnamn,
            sek: dishSek(dish),
          },
        ]
      : [];
  });
  const usual = drinkFor(person, choices);
  const kinds = [...(usual !== null && usual !== "ingen" && dishes.length > 0 ? [usual] : []), ...(choice?.drinks ?? [])];
  const drinks = kinds.map((kind) => ({
    key: `drink-${kind}`,
    kind: "drink" as const,
    label: drinkLabels[kind],
    sek: drinkPrice(menu, kind).sek,
  }));
  return [...dishes, ...drinks];
}

/** Adds the option to the person's list (last) when it is not there; the list of the others is as it was. */
export function withOption(options: readonly PersonOptions[], personId: string, option: DishOption): PersonOptions[] {
  return options.map((entry) =>
    entry.personId !== personId || entry.options.some((existing) => existing.dishIndex === option.dishIndex)
      ? entry
      : { ...entry, options: [...entry.options, option] },
  );
}

export type ReasonTone = "mint" | "sand" | "danger" | "plain";

/** How a reason is shown: love is mint, "undviker" and "kan innehålla" sand, a certain allergen red, a price gap plain text. */
export function reasonTone(reason: string, warning: DishOption["warning"]): ReasonTone {
  if (warning === "allergy") return "danger";
  if (/ älskar /i.test(reason)) return "mint";
  if (/ undviker /i.test(reason) || /^Kan innehålla/.test(reason)) return "sand";
  return "plain";
}

/** What a person with allergies cannot eat in a dish: only the certain ones. */
export function certainAllergens(dish: MenuDish, person: Pick<Person, "allergies">): string[] {
  return allergenHits(dish, person.allergies)
    .filter((hit) => hit.source === "allergener")
    .map((hit) => allergenLabels[hit.allergen].toLocaleLowerCase("sv-SE"));
}

/** The allergy line of "Ert val": "Anna: gluten. Gunnar: nötter." Empty when nobody has an allergy registered. */
export function allergyLine(company: readonly Person[]): string {
  return company
    .filter((person) => person.allergies.length > 0)
    .map((person) => `${person.name}: ${person.allergies.map((allergen) => allergenLabels[allergen].toLocaleLowerCase("sv-SE")).join(", ")}.`)
    .join(" ");
}

// The live reading: what the screen knows while the server reads.

export type ReadingView = {
  reader: MenuReader | null;
  language: Menu["sprak"] | null;
  dishes: MenuDish[];
};

export const emptyReadingView: ReadingView = {
  reader: null,
  language: null,
  dishes: [],
};

/** A stream line folded into what is shown: `restart` empties the list, `done` replaces it with the whole menu. */
export function foldReading(view: ReadingView, event: MenuStreamEvent): ReadingView {
  switch (event.type) {
    case "reading":
      return {
        reader: { model: event.model, effort: event.effort },
        language: event.restart ? null : view.language,
        dishes: event.restart ? [] : view.dishes,
      };
    case "language":
      return { ...view, language: event.sprak };
    case "dish": {
      const dishes = [...view.dishes];
      dishes[event.index] = event.dish;
      return { ...view, dishes: dishes.filter(Boolean) };
    }
    case "done":
      return {
        reader: { model: event.model, effort: event.effort },
        language: event.menu.sprak,
        dishes: event.menu.ratter,
      };
    default:
      return view;
  }
}

/** The one line the reading screen says: "Läser menyn…", "Översätter från spanska…", "Hittade 4 rätter". */
export function readingStatus(view: ReadingView, careful: boolean): string {
  if (view.dishes.length > 0) return `Hittade ${view.dishes.length} ${view.dishes.length === 1 ? "rätt" : "rätter"}`;
  if (view.language !== null && view.language !== "sv") return `Översätter från ${languageName(view.language)}…`;
  return careful ? "Läser menyn noggrannare…" : "Läser menyn…";
}
