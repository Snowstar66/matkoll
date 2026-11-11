import Link from "next/link";
import { cx } from "@/components/cx";
import { InfoIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { profilesHref } from "../domain/people";
import type { Choices, DishOption, PersonOptions } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Totals } from "../domain/drinks";
import type { Menu } from "../domain/types";
import { menuReaderText, type MenuReader } from "../domain/reading";
import { approxKr, cardSek, drinkFor, drinkPhrase, reasonTone, unpricedNote, type ReasonTone } from "./journey";
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
  filtered,
  uncertain,
  reader,
  canReadCarefully,
  error,
  onChoose,
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
  /** Someone ticked has an allergy: false shows the sand box that nothing is sorted out, with a way to add one. */
  filtered: boolean;
  uncertain: readonly string[];
  reader: MenuReader | null;
  canReadCarefully: boolean;
  error: string | null;
  onChoose: (personId: string, dishIndex: number) => void;
  /** "Fler rätter åt Anna": the whole menu with that person chosen. */
  onMore: (personId: string) => void;
  onDone: () => void;
  onFullMenu: () => void;
  onCareful: () => void;
  onBack: () => void;
}) {
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
      <div className="flex flex-col gap-5">
        {company.map((person, index) => {
          const mine = options.find((entry) => entry.personId === person.id)?.options ?? [];
          const drink = drinkFor(person, choices);
          const phrase = drinkPhrase(drink);
          const chosen = choices[person.id]?.dishIndex ?? null;
          return (
            <section key={person.id} aria-label={person.name} data-testid="menu-person" className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="flex items-center gap-2 text-headline font-semibold text-ink">
                  <PersonAvatar name={person.name} index={index} size="sm" />
                  {person.name}
                </span>
                {phrase ? <span className="text-body text-ink-2">{phrase}</span> : null}
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
              <TextLink onClick={() => onMore(person.id)} className="self-start text-meta">
                {`Fler rätter åt ${person.name === "Du" ? "dig" : person.name}`}
              </TextLink>
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
