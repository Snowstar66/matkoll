import { allergyDisclaimer } from "./disclaimer";
import type { Totals } from "./drinks";
import type { DrinkKind } from "./profile";
import type { Selection } from "./recommend";
import type { Menu } from "./types";

const drinkWord: Readonly<Record<DrinkKind, string>> = {
  vatten: "vatten",
  lask: "läsk",
  ol: "öl",
  vin: "vin",
  cocktail: "cocktail",
  kaffe: "kaffe",
  ingen: "",
};

const maxPeople = 8;

/**
 * Plain Swedish text to paste into a message: the restaurant, who is suggested what, the price per person, the
 * total (drinks marked as an estimate) and the allergy note. At most about 15 lines.
 */
export function buildShareText(menu: Menu, selection: Selection, totals: Totals): string {
  const lines = [menu.restaurang ? `Förslag på ${menu.restaurang}:` : "Förslag:"];
  const shown = totals.perPerson.filter((person) => selection.some((entry) => entry.personId === person.personId));
  for (const person of shown.slice(0, maxPeople)) {
    const dishes = selection.filter((entry) => entry.personId === person.personId).map((entry) => (entry.dish.forklaring ? `${entry.dish.originalnamn} (${entry.dish.forklaring.replace(/\.$/, "").toLocaleLowerCase("sv-SE")})` : entry.dish.originalnamn));
    const drink = person.drink && person.drink !== "ingen" ? ` + ${drinkWord[person.drink]}` : "";
    const price = person.totalSek > 0 ? `, ca ${person.totalSek} kr` : "";
    lines.push(`${person.name} – ${dishes.join(" + ")}${drink}${price}`);
  }
  if (shown.length > maxPeople) lines.push(`… och ${shown.length - maxPeople} till`);
  if (totals.totalSek > 0) lines.push(`Totalt ca ${totals.totalSek} kr${totals.drinksEstimated ? " (drycker är uppskattade)" : ""}.`);
  if (totals.unpriced > 0) lines.push(totals.unpriced === 1 ? "En rätt saknar pris och räknas inte med." : `${totals.unpriced} rätter saknar pris och räknas inte med.`);
  lines.push(allergyDisclaimer);
  return lines.join("\n");
}
