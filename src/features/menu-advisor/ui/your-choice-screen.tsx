import { allergyDisclaimer } from "../domain/disclaimer";
import type { Totals } from "../domain/drinks";
import { drinkIcons, drinkLabels } from "../domain/people";
import type { Choices, PersonOptions } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Menu, MenuDish } from "../domain/types";
import { allergyLine, approxKr, drinkFor } from "./journey";
import { BigButton, Headline, StickyFooter, TextLink, TopBack, TotalRow } from "./journey-parts";
import { swedishName } from "./dish-more";
import { PersonAvatar } from "./person-avatar";
import { dishSek } from "../domain/view";
import { optionFor } from "../domain/recommend-options";

/** A dish as the waiter reads it: the name as printed, large, the price, a short Swedish description, and the reason when it has an allergen of the person. */
function ChoiceDish({ dish, warning, testid }: { dish: MenuDish; warning?: string; testid: string }) {
  const sek = dishSek(dish);
  return (
    <div data-testid={testid} className="flex flex-col gap-0.5 border-t border-hairline py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[1.5rem] leading-8 font-bold text-ink wrap-break-word">{dish.originalnamn}</p>
        <span className={sek === null ? "shrink-0 text-meta text-ink-3" : "shrink-0 text-row-title font-semibold text-ink"}>
          {sek === null ? "Pris saknas" : approxKr(sek)}
        </span>
      </div>
      {swedishName(dish) ? (
        <p data-testid="menu-dish-swedish" className="text-headline font-medium text-ink">
          {swedishName(dish)}
        </p>
      ) : null}
      {dish.forklaring ? <p className="text-body text-ink-2">{dish.forklaring}</p> : null}
      {warning ? <p className="text-body font-semibold text-danger">{warning}</p> : null}
    </div>
  );
}

/**
 * Step 4, "Ert val": a clean summary to show the waiter. Per person the dish with its name as printed, large, and
 * a short Swedish description, the drinks and the price, then what was added on top (a starter, a
 * dessert) with its price; one line on allergies and the total.
 * It never promises that anything is safe.
 */
export function YourChoiceScreen({
  menu,
  company,
  options,
  choices,
  totals,
  onDone,
  onChange,
}: {
  menu: Menu;
  company: readonly Person[];
  options: readonly PersonOptions[];
  choices: Choices;
  totals: Totals;
  onDone: () => void;
  onChange: () => void;
}) {
  const allergies = allergyLine(company);
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="menu-choice">
      <TopBack onClick={onChange}>Förslag</TopBack>
      <Headline sub={menu.restaurang ? `${menu.restaurang} · visa upp för servitören` : "Visa upp för servitören"}>Ert val</Headline>
      <div className="flex flex-col gap-5">
        {company.map((person, index) => {
          const dishIndex = choices[person.id]?.dishIndex ?? null;
          const dish = dishIndex === null ? undefined : menu.ratter[dishIndex];
          const option = options.find((entry) => entry.personId === person.id)?.options.find((entry) => entry.dishIndex === dishIndex);
          const total = totals.perPerson.find((entry) => entry.personId === person.id);
          const extras = (choices[person.id]?.extras ?? []).flatMap((index) => optionFor(menu, index, person) ?? []);
          const usual = drinkFor(person, choices);
          const drinkKinds = [...(usual !== null && usual !== "ingen" && (dish || extras.length > 0) ? [usual] : []), ...(choices[person.id]?.drinks ?? [])];
          return (
            <section
              key={person.id}
              aria-label={person.name}
              data-testid="menu-choice-person"
              className="flex flex-col rounded-xl border border-border bg-surface"
            >
              <div className="flex items-center gap-3 px-4 pt-4 pb-1">
                <PersonAvatar name={person.name} index={index} size="sm" />
                <span className="min-w-0 flex-1 text-headline font-semibold text-ink">{person.name}</span>
                {total && total.totalSek > 0 ? <span className="shrink-0 text-row-title font-semibold text-ink">{approxKr(total.totalSek)}</span> : null}
              </div>
              <div className="flex flex-col px-4">
                {dish ? <ChoiceDish dish={dish} warning={option?.warning === "allergy" ? option.reasons[0] : undefined} testid="menu-choice-main" /> : null}
                {extras.map((extra) => (
                  <ChoiceDish
                    key={extra.dishIndex}
                    dish={extra.dish}
                    warning={extra.warning === "allergy" ? extra.reasons[0] : undefined}
                    testid="menu-choice-extra"
                  />
                ))}
                {!dish && extras.length === 0 ? <p className="py-3 text-body text-ink-2">Ingen rätt vald.</p> : null}
              </div>
              <div
                data-testid="menu-drink-line"
                className="m-3 mt-1 flex items-center justify-between gap-3 rounded-lg bg-bg px-3 py-3 text-row-title font-semibold text-ink"
              >
                <span>
                  {drinkKinds.length === 0 ? `${drinkIcons.ingen} Utan dryck` : drinkKinds.map((kind) => `${drinkIcons[kind]} ${drinkLabels[kind]}`).join("  ")}
                </span>
                {total && total.drinkSek > 0 ? <span className="shrink-0 font-normal text-ink-2">{approxKr(total.drinkSek)}</span> : null}
              </div>
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
