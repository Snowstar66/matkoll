import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";
import { cx } from "@/components/cx";
import { InfoIcon, TrashIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { drinkIcons, drinkLabels, profilesHref } from "../domain/people";
import { drinkPrice } from "../domain/drinks";
import type { DrinkKind } from "../domain/profile";
import type { Choices, DishOption, PersonOptions } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Totals } from "../domain/drinks";
import type { Menu } from "../domain/types";
import { optionFor } from "../domain/recommend-options";
import { dishSek } from "../domain/view";
import { menuReaderText, type MenuReader } from "../domain/reading";
import { approxKr, cardSek, drinkFor, reasonTone, toWhom, unpricedNote, type ReasonTone } from "./journey";
import { AnswerTabs, BigButton, Headline, RadioCard, StickyFooter, TextLink, TopBack, TotalRow } from "./journey-parts";
import { PersonAvatar } from "./person-avatar";

const toneClass: Record<ReasonTone, string> = {
  mint: "rounded-pill bg-mint px-3 py-0.5 text-mint-ink font-medium",
  sand: "rounded-pill bg-sand px-3 py-0.5 text-sand-ink font-medium",
  danger: "text-danger font-semibold",
  plain: "text-ink-3",
};

function Reasons({ option }: { option: DishOption }) {
  if (option.reasons.length === 0) return null;
  return (
    <span className="mt-1 flex flex-col items-start gap-1 text-meta">
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
        <button type="button" aria-label={`Ta bort ${drinkLabels[kind].toLocaleLowerCase("sv-SE")}`} onClick={onRemove} className="-mr-2 flex size-tap shrink-0 items-center justify-center rounded-pill text-ink-3">
          <TrashIcon size={18} />
        </button>
      ) : null}
    </li>
  );
}

/** What the last "Lägg till åt" did, said under that person: "Greta får också Toast Skagen." */
export type AddedNote = { personId: string; text: string };

/**
 * Step 4, "Det här passar er", the first tab beside Hela menyn: a group per person with two or three cards (the best one chosen, the others toned);
 * one tap changes the choice and the sum below. The total and "Klart" stay at the bottom while the list scrolls.
 * Only reasons that change a decision are written: love (mint), avoid (sand), a certain allergen (red), a price gap.
 */
export function AnswerScreen({
  menu,
  company,
  options,
  choices,
  totals,
  added = null,
  filtered,
  uncertain,
  pagesNotice,
  reader,
  canReadCarefully,
  error,
  onChoose,
  onRemoveExtra,
  onRemoveDish,
  onRemoveUsualDrink,
  onRemoveDrink,
  onAddDrink,
  onMore,
  onDone,
  onFullMenu,
  onCareful,
  onBack,
}: {
  menu: Menu;
  company: readonly Person[];
  options: readonly PersonOptions[];
  choices: Choices;
  totals: Totals;
  /** What the last "Lägg till åt" did; shown under that person, who is scrolled into view. */
  added?: AddedNote | null;
  /** Someone ticked has an allergy: false shows the sand box that nothing is sorted out, with a way to add one. */
  filtered: boolean;
  uncertain: readonly string[];
  /** A menu on several photos: which pages could not be read, with "Ta om" (the advisor makes it). */
  pagesNotice?: ReactNode;
  reader: MenuReader | null;
  canReadCarefully: boolean;
  error: string | null;
  onChoose: (personId: string, dishIndex: number) => void;
  /** Takes away a dish added on top (a starter, a dessert). */
  onRemoveExtra?: (personId: string, dishIndex: number) => void;
  /** Takes away the proposed dish (the soptunna on it, also when nothing was added). */
  onRemoveDish?: (personId: string) => void;
  /** Takes away the person's usual drink for this evening. */
  onRemoveUsualDrink?: (personId: string) => void;
  /** Takes away a drink that was added. */
  onRemoveDrink?: (personId: string, kind: DrinkKind) => void;
  /** "Lägg till dryck åt Anna": opens the drink sheet. */
  onAddDrink?: (personId: string) => void;
  /** "Fler rätter åt Anna": the whole menu with that person chosen. */
  onMore: (personId: string) => void;
  onDone: () => void;
  onFullMenu: () => void;
  onCareful: () => void;
  onBack: () => void;
}) {
  const note = useRef<HTMLParagraphElement>(null);
  // Back from the whole menu: the person the dish was added for is in view, with the note.
  useEffect(() => {
    note.current?.scrollIntoView?.({ block: "center" });
  }, [added]);
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="menu-answer">
      <TopBack onClick={onBack}>Tolka menyn</TopBack>
      <AnswerTabs value="answer" onChange={(tab) => tab === "menu" && onFullMenu()} />
      <Headline sub="Tryck på det du vill ha.">Det här passar er</Headline>
      {filtered ? null : (
        <div data-testid="menu-unfiltered" className="flex gap-2.5 rounded-xl bg-sand px-3.5 py-3 text-body text-sand-ink">
          <InfoIcon size={20} className="mt-0.5 shrink-0" />
          <p>
            Ingen av er har angett allergier, så inget är bortsorterat.{" "}
            <Link href={profilesHref} className="font-semibold underline underline-offset-4">
              Lägg till allergi
            </Link>
          </p>
        </div>
      )}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {pagesNotice}
      <div className="flex flex-col gap-5">
        {company.map((person, index) => {
          const mine = options.find((entry) => entry.personId === person.id)?.options ?? [];
          const drink = drinkFor(person, choices);
          const addedDrinks = choices[person.id]?.drinks ?? [];
          const usualDrink = drink !== null && drink !== "ingen" ? drink : null;
          const chosen = choices[person.id]?.dishIndex ?? null;
          const extras = (choices[person.id]?.extras ?? []).flatMap((dishIndex) => optionFor(menu, dishIndex, person) ?? []);
          return (
            <section key={person.id} aria-label={person.name} data-testid="menu-person" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="flex items-center gap-2 text-headline font-semibold text-ink">
                  <PersonAvatar name={person.name} index={index} size="sm" />
                  {person.name}
                </span>
              </div>
              <div role="radiogroup" aria-label={`Rätt åt ${person.name}`} className="flex flex-col gap-2.5">
                {mine.length === 0 ? <p className="rounded-xl bg-surface px-4 py-3 text-body text-ink-2">Jag hittade ingen rätt att föreslå. Titta i hela menyn.</p> : null}
                {mine.map((option) => (
                  <RadioCard
                    key={option.dishIndex}
                    name={`dish-${person.id}`}
                    value={String(option.dishIndex)}
                    checked={chosen === option.dishIndex}
                    tone={option.warning === "allergy" ? "danger" : "default"}
                    onSelect={() => onChoose(person.id, option.dishIndex)}
                    aside={approxKr(cardSek(menu, option.dish, drink))}
                  >
                    <span className={cx("text-headline font-bold", chosen === option.dishIndex || option.warning === "allergy" ? "text-ink" : "text-ink-2")}>{option.dish.originalnamn}</span>
                    {option.dish.forklaring ? <span className="line-clamp-2 text-meta text-ink-2">{option.dish.forklaring}</span> : null}
                    <Reasons option={option} />
                  </RadioCard>
                ))}
              </div>
              {chosen !== null && onRemoveDish ? (
                <button
                  type="button"
                  data-testid="menu-remove-dish"
                  onClick={() => onRemoveDish(person.id)}
                  className="flex min-h-tap items-center gap-2 self-start px-1 text-meta font-medium text-ink-2"
                >
                  <TrashIcon size={18} />
                  {`Ta bort ${menu.ratter[chosen]?.originalnamn ?? "rätten"}`}
                </button>
              ) : null}
              {extras.length > 0 ? (
                <ul aria-label={`Också åt ${toWhom(person)}`} className="flex flex-col rounded-xl bg-surface px-4 py-1">
                  {extras.map((extra) => {
                    const sek = dishSek(extra.dish);
                    return (
                      <li key={extra.dishIndex} data-testid="menu-extra" className="flex items-start gap-3 border-t border-hairline py-2 first:border-t-0">
                        <span className="flex min-w-0 flex-1 flex-col py-1">
                          <span className="text-row-title font-semibold text-ink">{extra.dish.originalnamn}</span>
                          <Reasons option={extra} />
                        </span>
                        <span className={cx("shrink-0 py-1", sek === null ? "text-meta text-ink-3" : "text-row-title text-ink")}>{sek === null ? "Pris saknas" : approxKr(sek)}</span>
                        {onRemoveExtra ? (
                          <button
                            type="button"
                            aria-label={`Ta bort ${extra.dish.originalnamn}`}
                            onClick={() => onRemoveExtra(person.id, extra.dishIndex)}
                            className="-mr-2 flex size-tap shrink-0 items-center justify-center rounded-pill text-ink-3"
                          >
                            <TrashIcon size={18} />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {usualDrink !== null || addedDrinks.length > 0 || drink === "ingen" ? (
                <ul aria-label={`Dryck åt ${toWhom(person)}`} data-testid="menu-drinks" className="flex flex-col rounded-xl bg-surface px-4 py-1">
                  {usualDrink !== null ? (
                    <DrinkRow kind={usualDrink} menu={menu} usual onRemove={onRemoveUsualDrink ? () => onRemoveUsualDrink(person.id) : undefined} />
                  ) : addedDrinks.length === 0 ? (
                    <li data-testid="menu-no-drink" className="py-2 text-body text-ink-2">
                      Utan dryck
                    </li>
                  ) : null}
                  {addedDrinks.map((kind) => (
                    <DrinkRow key={kind} kind={kind} menu={menu} onRemove={onRemoveDrink ? () => onRemoveDrink(person.id, kind) : undefined} />
                  ))}
                </ul>
              ) : null}
              {added?.personId === person.id ? (
                <p ref={note} role="status" data-testid="menu-added" className="px-1 text-body text-ink-2">
                  {added.text}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-x-5">
                <TextLink onClick={() => onMore(person.id)} className="self-start text-meta">
                  {`Fler rätter åt ${toWhom(person)}`}
                </TextLink>
                {onAddDrink ? (
                  <TextLink onClick={() => onAddDrink(person.id)} className="self-start text-meta" data-testid="menu-add-drink">
                    {`Lägg till dryck åt ${toWhom(person)}`}
                  </TextLink>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      {uncertain.length > 0 ? (
        <p data-testid="menu-uncertain" className="text-meta text-ink-3">
          Osäkert läst: {uncertain.join("; ")}
        </p>
      ) : null}
      <p className="text-center text-meta text-ink-3">
        {reader ? <span data-testid="menu-reader">{menuReaderText(reader)}</span> : null}
        {reader && canReadCarefully ? " · " : null}
        {canReadCarefully ? (
          <button type="button" onClick={onCareful} className="min-h-tap font-medium text-ink-2 underline underline-offset-4">
            Läs noggrannare
          </button>
        ) : null}
      </p>
      <StickyFooter>
        <TotalRow sek={totals.totalSek} note={unpricedNote(totals)} />
        <BigButton onClick={onDone}>Klart</BigButton>
      </StickyFooter>
    </div>
  );
}
