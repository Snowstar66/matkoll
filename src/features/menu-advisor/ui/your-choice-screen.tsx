import { allergyDisclaimer } from "../domain/disclaimer";
import type { Totals } from "../domain/drinks";
import { drinkIcons, drinkLabels } from "../domain/people";
import type { Choices, PersonOptions } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Menu } from "../domain/types";
import { allergyLine, approxKr, drinkFor } from "./journey";
import { BigButton, Headline, StickyFooter, TextLink, TopBack, TotalRow } from "./journey-parts";
import { PersonAvatar } from "./person-avatar";
import { dishSek } from "../domain/view";

/**
 * Step 4, "Ert val": a clean summary to show the waiter. Per person the dish with its name as printed, large, and
 * a short Swedish description, the drink (tap it to change) and the price; one line on allergies and the total.
 * It never promises that anything is safe.
 */
export function YourChoiceScreen({
  menu,
  company,
  options,
  choices,
  totals,
  onDrink,
  onDone,
  onChange,
}: {
  menu: Menu;
  company: readonly Person[];
  options: readonly PersonOptions[];
  choices: Choices;
  totals: Totals;
  /** Opens the sheet for this person's drink. */
  onDrink: (personId: string) => void;
  onDone: () => void;
  onChange: () => void;
}) {
  const allergies = allergyLine(company);
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="menu-choice">
      <TopBack onClick={onChange}>Förslag</TopBack>
      <Headline sub={menu.restaurang ? `${menu.restaurang} · visa upp för servitören` : "Visa upp för servitören"}>Ert val</Headline>
      <div className="flex flex-col gap-3">
        {company.map((person, index) => {
          const dishIndex = choices[person.id]?.dishIndex ?? null;
          const dish = dishIndex === null ? undefined : menu.ratter[dishIndex];
          const option = options.find((entry) => entry.personId === person.id)?.options.find((entry) => entry.dishIndex === dishIndex);
          const drink = drinkFor(person, choices);
          const total = totals.perPerson.find((entry) => entry.personId === person.id);
          return (
            <section key={person.id} aria-label={person.name} data-testid="menu-choice-person" className="flex flex-col gap-2 rounded-xl bg-surface px-4 py-4">
              <span className="flex items-center gap-2 text-body font-semibold text-ink-2">
                <PersonAvatar name={person.name} index={index} size="sm" />
                {person.name}
              </span>
              {dish ? (
                <>
                  <p className="text-[1.5rem] leading-8 font-bold text-ink">{dish.originalnamn}</p>
                  {dish.forklaring ? <p className="text-body text-ink-2">{dish.forklaring}</p> : null}
                  {option?.warning === "allergy" && option.reasons[0] ? <p className="text-body font-semibold text-danger">{option.reasons[0]}</p> : null}
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      data-testid="menu-drink-button"
                      aria-label={`Dryck åt ${person.name}: ${drink ? drinkLabels[drink] : "ingen vald"}. Byt dryck`}
                      onClick={() => onDrink(person.id)}
                      className="flex min-h-tap items-center gap-2 rounded-pill bg-fill px-4 text-body font-medium text-ink"
                    >
                      <span aria-hidden="true">{drink ? drinkIcons[drink] : "🥤"}</span>
                      {drink ? drinkLabels[drink] : "Välj dryck"}
                      {total && total.drinkSek > 0 ? <span className="text-ink-2">{approxKr(total.drinkSek)}</span> : null}
                    </button>
                    <span className="text-headline font-semibold text-ink">{approxKr(dishSek(dish))}</span>
                  </div>
                </>
              ) : (
                <p className="text-body text-ink-2">Ingen rätt vald.</p>
              )}
            </section>
          );
        })}
      </div>
      <div className="flex flex-col gap-1 text-meta text-ink-3" data-testid="menu-allergy-line">
        {allergies ? <p className="text-body text-ink-2">{allergies}</p> : null}
        <p data-testid="menu-disclaimer">{allergyDisclaimer}</p>
      </div>
      <StickyFooter>
        <TotalRow sek={totals.totalSek} note={totals.drinksEstimated ? "Drycker är uppskattade" : null} />
        <BigButton onClick={onDone}>Klart</BigButton>
        <TextLink onClick={onChange}>Ändra</TextLink>
      </StickyFooter>
    </div>
  );
}
