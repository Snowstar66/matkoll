import { useState } from "react";
import { Button } from "@/components/button";
import { cx } from "@/components/cx";
import { Sheet } from "@/components/sheet";
import { allergyDisclaimer } from "../domain/disclaimer";
import { allergenHits } from "../domain/allergens";
import { allergenLabels } from "../domain/labels";
import { meId } from "../domain/people";
import type { Person } from "../domain/profile";
import type { MenuDish } from "../domain/types";
import { certainAllergens, joinNames, listPrice } from "./journey";
import { PersonAvatar } from "./person-avatar";

/** Who the dish suits, said plainly, in parts: "Passar Du och Anna." and (bad) "Gunnar kan inte (nötter)."; none without company. */
export function fitParts(dish: MenuDish, company: readonly Person[]): { text: string; bad: boolean }[] {
  if (company.length === 0) return [];
  const cannot = company.map((person) => ({ person, what: certainAllergens(dish, person) })).filter((entry) => entry.what.length > 0);
  if (cannot.length === 0) return [{ text: company.length === 1 ? `Passar ${company[0]!.id === meId ? "dig" : company[0]!.name}.` : "Passar alla.", bad: false }];
  const fits = company.filter((person) => !cannot.some((entry) => entry.person.id === person.id)).map((person) => person.name);
  return [
    ...(fits.length > 0 ? [{ text: `Passar ${joinNames(fits)}.`, bad: false }] : []),
    ...cannot.map((entry) => ({ text: `${entry.person.name} kan inte (${entry.what.join(", ")}).`, bad: true })),
  ];
}

/** The same as one sentence: "Passar Du och Anna. Gunnar kan inte (nötter)." */
export function fitSentence(dish: MenuDish, company: readonly Person[]): string {
  return fitParts(dish, company)
    .map((part) => part.text)
    .join(" ");
}

/** "Anna: kan innehålla gluten. Fråga personalen." for those who may not be able to eat the dish; empty when no one. */
export function maybeSentence(dish: MenuDish, company: readonly Person[]): string {
  return company
    .map((person) => ({ person, maybe: allergenHits(dish, person.allergies).filter((hit) => hit.source === "kan_innehalla").map((hit) => allergenLabels[hit.allergen].toLocaleLowerCase("sv-SE")) }))
    .filter((entry) => entry.maybe.length > 0)
    .map((entry) => `${entry.person.name}: kan innehålla ${entry.maybe.join(", ")}. Fråga personalen.`)
    .join(" ");
}

/**
 * Step 6, the dish in a sheet: name, what it is, what is in it, the price, who it suits, and one button to add it as
 * an option for a person ("Lägg till åt Anna"; from "Fler rätter åt Anna" the person is chosen, else a row of avatars).
 * In "Bara förklara" there is no one to add it for; only "Lägg till Ikväll".
 */
export function DishSheet({
  dish,
  company,
  fromPersonId,
  explain,
  starred,
  onAdd,
  onStar,
  onClose,
}: {
  dish: MenuDish | null;
  company: readonly Person[];
  /** Opened from "Fler rätter åt Anna": that person is chosen. */
  fromPersonId: string | null;
  explain: boolean;
  starred: boolean;
  onAdd: (personId: string) => void;
  onStar: () => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const target = company.find((person) => person.id === (fromPersonId ?? picked)) ?? company[0];
  const canAdd = dish !== null && !explain && dish.grupp !== "Drycker" && target !== undefined;
  const fit = dish && !explain ? fitParts(dish, company) : [];
  const maybe = dish && !explain ? maybeSentence(dish, company) : "";
  const price = dish ? listPrice(dish) : "";
  const ingredients = dish?.huvudingredienser.join(", ") ?? "";
  return (
    <Sheet
      open={dish !== null}
      onClose={onClose}
      title={dish?.originalnamn ?? "Rätt"}
      closeLabel="Klar"
      footer={
        dish ? (
          <>
            {canAdd ? (
              <Button data-testid="menu-dish-add" fullWidth onClick={() => onAdd(target.id)}>
                {`Lägg till åt ${target.name === "Du" ? "dig" : target.name}`}
              </Button>
            ) : null}
            <Button variant={canAdd ? "text" : "primary"} fullWidth onClick={onStar} data-testid="menu-dish-tonight">
              {starred ? "Ta bort från Ikväll" : "Lägg till Ikväll"}
            </Button>
          </>
        ) : null
      }
    >
      {dish ? (
        <div className="flex flex-col gap-3 pb-2" data-testid="menu-dish-sheet">
          {dish.forklaring ? <p className="text-headline text-ink-2">{dish.forklaring}</p> : null}
          {price ? <p className="text-[1.75rem] leading-8 font-bold text-ink">{price}</p> : null}
          {ingredients ? (
            <div className="flex flex-col">
              <span className="text-meta font-semibold text-ink-3">Innehåller</span>
              <p className="text-body text-ink">{ingredients}</p>
            </div>
          ) : null}
          {fit.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p data-testid="menu-dish-fit" className="text-body text-ink">
                {fit.map((part, index) => (
                  <span key={part.text} className={part.bad ? "font-semibold text-danger" : undefined}>
                    {index > 0 ? " " : ""}
                    {part.text}
                  </span>
                ))}
              </p>
              {maybe ? <p className="text-body text-ink-2">{maybe}</p> : null}
            </div>
          ) : null}
          {canAdd && fromPersonId === null && company.length > 1 ? (
            <div role="radiogroup" aria-label="Lägg till åt" className="flex flex-wrap gap-2">
              {company.map((person, index) => (
                <button
                  key={person.id}
                  type="button"
                  role="radio"
                  aria-checked={person.id === target.id}
                  onClick={() => setPicked(person.id)}
                  className={cx(
                    "flex min-h-tap items-center gap-2 rounded-pill border-2 py-1 pr-4 pl-1.5 text-body font-medium",
                    person.id === target.id ? "border-accent bg-surface text-ink" : "border-transparent bg-fill text-ink-2",
                  )}
                >
                  <PersonAvatar name={person.name} index={index} size="sm" />
                  {person.name}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-meta text-ink-3">{allergyDisclaimer}</p>
        </div>
      ) : null}
    </Sheet>
  );
}
