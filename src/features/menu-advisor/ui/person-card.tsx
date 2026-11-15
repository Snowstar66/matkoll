import { cx } from "@/components/cx";
import { ChevronDownIcon, InfoIcon, TrashIcon } from "@/components/icons";
import { drinkIcons, drinkLabels } from "../domain/people";
import { drinkPrice } from "../domain/drinks";
import type { DrinkKind, Person } from "../domain/profile";
import type { Choice, DishOption } from "../domain/options";
import type { Menu } from "../domain/types";
import { optionFor } from "../domain/recommend-options";
import { dishSek } from "../domain/view";
import { approxKr, drinkFor, reasonTone, toWhom, type ReasonTone } from "./journey";
import { PillButton, RadioCard } from "./journey-parts";
import { DishBlurb } from "./dish-more";
import { PersonAvatar } from "./person-avatar";
import { ProposalRow } from "./proposal-row";

const toneClass: Record<ReasonTone, string> = {
  mint: "rounded-pill bg-mint px-3 py-0.5 text-mint-ink font-medium",
  sand: "rounded-pill bg-sand px-3 py-0.5 text-sand-ink font-medium",
  danger: "text-danger font-semibold",
  plain: "text-ink-3",
};

function Reasons({ option }: { option: DishOption }) {
  if (option.reasons.length === 0) return null;
  return (
    <span className="mt-0.5 flex flex-col items-start gap-0.5 text-meta">
      {option.reasons.map((reason) => {
        const tone = reasonTone(reason, option.warning);
        return (
          <span key={reason} data-tone={tone} className={cx(toneClass[tone], tone === "danger" && "flex gap-2 leading-snug")}>
            {tone === "danger" ? <i aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-pill bg-danger" /> : null}
            {reason}
          </span>
        );
      })}
    </span>
  );
}

/** "Mer om rätten" under a dish: opens the sheet that tells about it. Inside a choice card it must not choose the card. */
function InfoButton({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="menu-dish-info"
      aria-label={`Mer om ${name}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="-ml-1 mt-0.5 inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-1 text-meta font-semibold text-accent"
    >
      <InfoIcon size={16} />
      Mer om rätten
    </button>
  );
}

const trash = "-mr-2 flex size-tap shrink-0 items-center justify-center rounded-pill text-ink-3";

/** One drink of a person with its price; the usual one says so. The soptunna takes it away. */
function DrinkRow({ kind, menu, usual = false, onRemove }: { kind: DrinkKind; menu: Menu; usual?: boolean; onRemove?: () => void }) {
  const price = drinkPrice(menu, kind);
  return (
    <li data-testid="menu-drink-row" data-usual={usual ? "true" : undefined} className="flex items-center gap-3 border-t border-hairline first:border-t-0">
      <span className="flex min-w-0 flex-1 flex-col py-2">
        <span className="flex items-center gap-2 text-row-title font-semibold text-ink">
          <span aria-hidden="true">{drinkIcons[kind]}</span>
          {drinkLabels[kind]}
        </span>
        {usual ? <span className="text-meta text-ink-3">Din vanliga dryck</span> : null}
      </span>
      <span className="shrink-0 text-row-title text-ink">{price.sek > 0 ? `${price.source === "uppskattning" ? "ca " : ""}${price.sek} kr` : "0 kr"}</span>
      {onRemove ? (
        <button type="button" aria-label={`Ta bort ${drinkLabels[kind].toLocaleLowerCase("sv-SE")}`} onClick={onRemove} className={trash}>
          <TrashIcon size={18} />
        </button>
      ) : null}
    </li>
  );
}

/** "Pulpo, Gambas, Vin": the first word of each thing a person has, for the folded card. */
export function cardSummary(menu: Menu, person: Person, choice: Choice | undefined): string {
  const names = [choice?.dishIndex ?? null, ...(choice?.extras ?? [])].flatMap((index) => {
    const dish = index === null ? undefined : menu.ratter[index];
    return dish ? [dish.originalnamn.split(/\s+/)[0]!] : [];
  });
  const usual = choice?.drink ?? person.drink;
  const drinks = [...(usual !== null && usual !== "ingen" ? [usual] : []), ...(choice?.drinks ?? [])].map((kind) => drinkLabels[kind]);
  const all = [...names, ...drinks];
  return all.length === 0 ? "Inget valt" : all.join(", ");
}

/**
 * One person's own card: avatar, name and what they land on at the top; the up to three proposals as cards you choose
 * (the chosen one has the soptunna); "Tillägg", the dishes and drinks added on top, each with a price and a soptunna;
 * and two buttons, "Lägg till rätt" and "Lägg till dryck". From four people the card starts folded to one row.
 */
export function PersonCard({
  menu,
  person,
  index,
  options,
  choice,
  sek,
  folded,
  danger,
  added,
  onToggle,
  onChoose,
  onRemoveExtra,
  onDismiss,
  onUndo,
  onRemoveUsualDrink,
  onRemoveDrink,
  onAddDish,
  onAddDrink,
  onInfo,
}: {
  menu: Menu;
  person: Person;
  index: number;
  options: readonly DishOption[];
  choice: Choice | undefined;
  /** What the person lands on, in kronor. */
  sek: number;
  /** Folded to one row (four or more people); a tap on the row opens it. */
  folded?: boolean;
  /** The chosen dish has a certain allergen of the person: a red dot on the folded row. */
  danger: boolean;
  added: string | null;
  /** "Ångra" beside the note: puts back what the note says was taken away. */
  onUndo?: () => void;
  onToggle?: () => void;
  onChoose: (dishIndex: number) => void;
  onRemoveExtra?: (dishIndex: number) => void;
  /** The soptunna on a proposal: it leaves the card (and can be put back from "Lägg till rätt"). */
  onDismiss?: (dishIndex: number) => void;
  onRemoveUsualDrink?: () => void;
  onRemoveDrink?: (kind: DrinkKind) => void;
  onAddDish: () => void;
  onAddDrink?: () => void;
  /** "Mer om rätten" on a dish: opens the sheet that tells about it. Left out: no such button. */
  onInfo?: (dishIndex: number) => void;
}) {
  const drink = drinkFor(person, choice ? { [person.id]: choice } : {});
  const addedDrinks = choice?.drinks ?? [];
  const usualDrink = drink !== null && drink !== "ingen" ? drink : null;
  const chosen = choice?.dishIndex ?? null;
  const dismissed = choice?.dismissed ?? [];
  const visible = options.filter((option) => !dismissed.includes(option.dishIndex));
  const extras = (choice?.extras ?? []).flatMap((dishIndex) => optionFor(menu, dishIndex, person) ?? []);
  const sum = sek > 0 ? approxKr(sek) : "";
  const head = (
    <>
      <PersonAvatar name={person.name} index={index} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-headline font-semibold text-ink">{person.name}</span>
        {onToggle ? (
          <span className="block truncate text-meta text-ink-2" data-testid="menu-person-summary">
            {cardSummary(menu, person, choice)}
          </span>
        ) : null}
      </span>
      {danger && onToggle ? <i aria-hidden="true" data-testid="menu-person-danger" className="size-2.5 shrink-0 rounded-pill bg-danger" /> : null}
      {sum ? (
        <span data-testid="menu-person-total" className="shrink-0 text-row-title font-semibold text-ink">
          {sum}
        </span>
      ) : null}
      {onToggle ? <ChevronDownIcon size={20} className={cx("shrink-0 text-ink-3", !folded && "rotate-180")} /> : null}
    </>
  );
  return (
    <section
      aria-label={person.name}
      data-testid="menu-person"
      data-folded={folded ? "true" : undefined}
      className="flex flex-col rounded-xl border border-border bg-surface"
    >
      {onToggle ? (
        <button type="button" aria-expanded={!folded} onClick={onToggle} className="flex min-h-[68px] items-center gap-3 rounded-xl px-4 py-2 text-left">
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 pt-3">{head}</div>
      )}
      {folded ? null : (
        <div className="flex flex-col gap-2 px-3 pt-2 pb-3">
          <div role="radiogroup" aria-label={`Rätt åt ${person.name}`} className="flex flex-col gap-2">
            {visible.length === 0 ? (
              <p data-testid="menu-no-proposals" className="rounded-xl bg-bg px-4 py-3 text-body text-ink-2">
                {options.length === 0 ? "Jag hittade ingen rätt att föreslå. Lägg till en själv." : "Du har tagit bort alla förslag. Lägg till rätt för att välja själv."}
              </p>
            ) : null}
            {visible.map((option) => {
              const card = (
                <RadioCard
                  key={option.dishIndex}
                  name={`dish-${person.id}`}
                  value={String(option.dishIndex)}
                  checked={chosen === option.dishIndex}
                  tone={option.warning === "allergy" ? "danger" : "default"}
                  onCard
                  onSelect={() => onChoose(option.dishIndex)}
                  aside={approxKr(dishSek(option.dish))}
                >
                  <span className={cx("text-headline font-bold", chosen === option.dishIndex || option.warning === "allergy" ? "text-ink" : "text-ink-2")}>
                    {option.dish.originalnamn}
                  </span>
                  <DishBlurb dish={option.dish} />
                  <Reasons option={option} />
                  {onInfo ? <InfoButton name={option.dish.originalnamn} onClick={() => onInfo(option.dishIndex)} /> : null}
                </RadioCard>
              );
              return onDismiss ? (
                <ProposalRow key={option.dishIndex} removeLabel={`Ta bort förslaget ${option.dish.originalnamn}`} onRemove={() => onDismiss(option.dishIndex)}>
                  {card}
                </ProposalRow>
              ) : (
                card
              );
            })}
          </div>
          {extras.length > 0 || usualDrink !== null || addedDrinks.length > 0 || drink === "ingen" ? (
            <div data-testid="menu-extras-box" className="flex flex-col rounded-lg bg-bg px-3 pt-2 pb-1">
              <p className="text-meta font-semibold text-ink-3">Tillägg</p>
              {extras.length > 0 ? (
                <ul aria-label={`Också åt ${toWhom(person)}`} className="flex flex-col">
                  {extras.map((extra) => {
                    const price = dishSek(extra.dish);
                    return (
                      <li key={extra.dishIndex} data-testid="menu-extra" className="flex items-start gap-3 border-t border-hairline py-1 first:border-t-0">
                        <span className="flex min-w-0 flex-1 flex-col py-2">
                          <span className="text-row-title font-semibold text-ink">{extra.dish.originalnamn}</span>
                          <DishBlurb dish={extra.dish} lines={2} />
                          <Reasons option={extra} />
                          {onInfo ? <InfoButton name={extra.dish.originalnamn} onClick={() => onInfo(extra.dishIndex)} /> : null}
                        </span>
                        <span className={cx("shrink-0 py-2", price === null ? "text-meta text-ink-3" : "text-row-title text-ink")}>
                          {price === null ? "Pris saknas" : approxKr(price)}
                        </span>
                        {onRemoveExtra ? (
                          <button
                            type="button"
                            aria-label={`Ta bort ${extra.dish.originalnamn}`}
                            onClick={() => onRemoveExtra(extra.dishIndex)}
                            className={trash}
                          >
                            <TrashIcon size={18} />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <ul
                aria-label={`Dryck åt ${toWhom(person)}`}
                data-testid="menu-drinks"
                className={cx("flex flex-col", extras.length > 0 && "border-t border-hairline")}
              >
                {usualDrink !== null ? (
                  <DrinkRow kind={usualDrink} menu={menu} usual onRemove={onRemoveUsualDrink} />
                ) : addedDrinks.length === 0 ? (
                  <li data-testid="menu-no-drink" className="flex min-h-tap items-center gap-2 py-2 text-row-title font-semibold text-ink-2">
                    <span aria-hidden="true">{drinkIcons.ingen}</span>
                    Utan dryck
                  </li>
                ) : null}
                {addedDrinks.map((kind) => (
                  <DrinkRow key={kind} kind={kind} menu={menu} onRemove={onRemoveDrink ? () => onRemoveDrink(kind) : undefined} />
                ))}
              </ul>
            </div>
          ) : null}
          {added ? (
            <p role="status" data-testid="menu-added" className="flex flex-wrap items-center gap-x-2 px-1 text-body text-ink-2">
              {added}
              {onUndo ? (
                <button type="button" data-testid="menu-undo" onClick={onUndo} className="min-h-9 font-semibold text-accent underline underline-offset-4">
                  Ångra
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="flex gap-2.5">
            <PillButton data-testid="menu-add-dish" aria-label={`Lägg till rätt åt ${toWhom(person)}`} onClick={onAddDish}>
              Lägg till rätt
            </PillButton>
            {onAddDrink ? (
              <PillButton data-testid="menu-add-drink" aria-label={`Lägg till dryck åt ${toWhom(person)}`} onClick={onAddDrink}>
                Lägg till dryck
              </PillButton>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
