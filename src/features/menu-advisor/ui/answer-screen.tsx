import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { InfoIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { profilesHref } from "../domain/people";
import type { DrinkKind } from "../domain/profile";
import type { Choices, PersonOptions } from "../domain/options";
import type { Person } from "../domain/profile";
import type { Totals } from "../domain/drinks";
import type { Menu } from "../domain/types";
import { menuReaderText, type MenuReader } from "../domain/reading";
import { unpricedNote } from "./journey";
import { Headline, StickyFooter, TextLink, TopBack } from "./journey-parts";
import { PersonCard } from "./person-card";
import { Receipt } from "./receipt";

/** What the last "Lägg till" did, said under that person: "Greta får också Toast Skagen." */
export type AddedNote = {
  personId: string;
  text: string;
  /** "Ångra" beside the note. */
  undo?: () => void;
  /** Said where it is: the page does not move to the note (a proposal taken away stays where the finger is). */
  quiet?: boolean;
};

/** From this many people the cards start folded to one row each. */
export const foldFrom = 4;

/**
 * Step 4, "Det här passar er": a card per person with the up to three proposals as cards you choose (the best chosen),
 * what was added on top, and two buttons to add a dish or a drink. The nota at the bottom shows the sum growing.
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
  onDismiss,
  onRemoveUsualDrink,
  onRemoveDrink,
  onAddDrink,
  onInfo,
  onAddDish,
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
  /** What the last "Lägg till åt" from the whole menu did; shown under that person, who is scrolled into view. */
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
  /** The soptunna or a swipe on a proposal: it leaves the card, and can be put back from "Lägg till rätt". */
  onDismiss?: (personId: string, dishIndex: number) => void;
  /** Takes away the person's usual drink for this evening. */
  onRemoveUsualDrink?: (personId: string) => void;
  /** Takes away a drink that was added. */
  onRemoveDrink?: (personId: string, kind: DrinkKind) => void;
  /** "Lägg till dryck": opens the drink sheet for that person. */
  onAddDrink?: (personId: string) => void;
  /** "Lägg till rätt": opens the sheet with the whole menu for that person. */
  onAddDish: (personId: string) => void;
  /** "Mer om rätten" on a dish: opens the sheet that tells about it. */
  onInfo?: (dishIndex: number) => void;
  onDone: () => void;
  onFullMenu: () => void;
  onCareful: () => void;
  onBack: () => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const folding = company.length >= foldFrom;
  // The one card that is open while the others are folded (four or more people); the one touched opens.
  const [openId, setOpenId] = useState<string | null>(null);
  // Back from the whole menu: the person the dish was added for is in view, with the note.
  useEffect(() => {
    if (!added || added.quiet) return;
    const who = company.find((person) => person.id === added.personId);
    const card = who ? Array.from(list.current?.children ?? []).find((child) => child.getAttribute("aria-label") === who.name) : undefined;
    // The note itself, not the card: with the explanations the card can be taller than the screen, and the note stands at its foot.
    (card?.querySelector("[data-testid=menu-added]") ?? card)?.scrollIntoView?.({ block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new note moves the page
  }, [added]);
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="menu-answer">
      <TopBack onClick={onBack}>Tolka menyn</TopBack>
      <Headline>Det här passar er</Headline>
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
      <div ref={list} className={folding ? "flex flex-col gap-2.5" : "flex flex-col gap-5"}>
        {company.map((person, index) => {
          const mine = options.find((entry) => entry.personId === person.id)?.options ?? [];
          const choice = choices[person.id];
          const chosen = choice?.dishIndex ?? null;
          const folded = folding && openId !== person.id && added?.personId !== person.id;
          return (
            <PersonCard
              key={person.id}
              menu={menu}
              person={person}
              index={index}
              options={mine}
              choice={choice}
              sek={totals.perPerson.find((entry) => entry.personId === person.id)?.totalSek ?? 0}
              folded={folded}
              danger={mine.some((option) => option.dishIndex === chosen && option.warning === "allergy")}
              added={added?.personId === person.id ? added.text : null}
              onToggle={folding ? () => setOpenId(openId === person.id ? null : person.id) : undefined}
              onChoose={(dishIndex) => onChoose(person.id, dishIndex)}
              onRemoveExtra={onRemoveExtra ? (dishIndex) => onRemoveExtra(person.id, dishIndex) : undefined}
              onDismiss={onDismiss ? (dishIndex) => onDismiss(person.id, dishIndex) : undefined}
              onUndo={added?.personId === person.id ? added.undo : undefined}
              onRemoveUsualDrink={onRemoveUsualDrink ? () => onRemoveUsualDrink(person.id) : undefined}
              onRemoveDrink={onRemoveDrink ? (kind) => onRemoveDrink(person.id, kind) : undefined}
              onAddDish={() => onAddDish(person.id)}
              onAddDrink={onAddDrink ? () => onAddDrink(person.id) : undefined}
              onInfo={onInfo}
            />
          );
        })}
      </div>
      {uncertain.length > 0 ? (
        <p data-testid="menu-uncertain" className="text-meta text-ink-3">
          Osäkert läst: {uncertain.join("; ")}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center justify-center text-center text-meta text-ink-3">
        {reader ? <span data-testid="menu-reader">{menuReaderText(reader)}</span> : null}
        {reader ? <span aria-hidden="true">&nbsp;·&nbsp;</span> : null}
        <TextLink onClick={onFullMenu} data-testid="menu-open-full" className="text-meta">
          Hela menyn
        </TextLink>
        {canReadCarefully ? (
          <TextLink onClick={onCareful} className="text-meta">
            Läs noggrannare
          </TextLink>
        ) : null}
      </p>
      <StickyFooter>
        <Receipt menu={menu} company={company} choices={choices} totals={totals} note={unpricedNote(totals)} onDone={onDone} />
      </StickyFooter>
    </div>
  );
}
