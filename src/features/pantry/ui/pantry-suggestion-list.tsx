"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { catalogName } from "@/features/catalog";
import { Notice } from "@/components/notice";
import {
  addCheckedText,
  alreadyHereText,
  changedPlaceText,
  checkedSummaryText,
  currentAmountText,
  incompleteComparisonText,
  isBulkConfirmable,
  analyzedPhotoGoneText,
  suggestionAmountText,
  suggestionsArrivedText,
  suggestionInvalidText,
  suggestionsHeading,
  suggestionsSiteText,
  suggestionTitle,
  unchangedCountText,
  uncertainBadgeText,
  unreadPlaceText,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";
import { cardNumber, numberedCards, photoMarkers, photoNumbersStatus, type PhotoPoint } from "../domain/photo-numbers";
import { AnalyzedPhotoButton, AnalyzedPhotoSheet, PhotoNumberBadge, PhotoNumberText } from "./analyzed-photo";
import { usePantrySheet } from "./pantry-item-sheet";
import { usePantrySuggestions } from "./pantry-suggestions";
import { focusIsFree } from "./use-pantry-analysis";
import { AiWorking } from "@/components/ai-working";
import { cx } from "@/components/cx";

/** Said politely by the status line below (locatingText); this is only for the eye. */
const locatingSteps = ["Letar upp varorna på fotot …", "Sätter ut numren …"];

// Lagerförslag (FR-24, DESIGN.md Lagerförslag): the suggestions from the
// latest photo, under the camera button, in a section headed "Lagerförslag
// från kylen" after the photographed place, which may not be the chosen
// card. Each card, like a recipe row, shows the name, the amount ("1 förp",
// "Finns hemma") and the place, "Ny" when the catalog ingredient will be
// created, and what the place has now ("I kylen nu: 2 förp"), since
// confirming sets the amount exactly. Story 6.2: each card has Bekräfta
// (primary), Rätta and Avvisa (text buttons), and "Bekräfta alla" sits under
// the heading; nothing is saved without one of them, or the sheet's
// "Bekräfta" after Rätta. While a confirmation is saved every button here is
// disabled and the cards being saved say "Sparar …"; a failure shows in a
// notice at the top of the section, and the suggestions stay. After a card
// is confirmed or rejected focus goes to the next card's Bekräfta, else the
// previous card's, else the camera button; after "Bekräfta alla" to the
// camera button (moved by the provider). A suggestion that cannot be
// confirmed as it is says so on its card, where only Rätta and Avvisa work,
// and "Bekräfta alla" leaves it out.
//
// Story 6.4: a photo compared with a place that has items shows, under the
// heading and "Bekräfta alla", how many suggestions already match ("2 varor
// stämmer med matvarorna.", no cards for them) and the groups "Nytt", "Ändrat"
// and "Syns inte längre" (h3, an empty group is left out). An "Ändrat" card
// shows "nu: 2 förp → bilden: 1 förp" instead of "I kylen nu"; a "Syns inte
// längre" card shows what the place has, with "Ta bort" (primary) and
// "Behåll". Focus moves through the cards in that order. An empty place, or
// one that could not be read ("Det gick inte att jämföra med matvarorna i
// kylen."), shows the plain list.
//
// Story 6.5: a card's title is the model's label as on the package ("ICA
// vispgrädde 36 %"), with the catalog ingredient under it ("Sparas som:
// Vispgrädde"); the buttons keep
// the catalog name, which is what is saved. A suggestion the model was
// unsure of has the badge "Osäker" and a line that "Bekräfta alla" leaves it
// out: it needs its own Bekräfta or Rätta, and after "Bekräfta alla" focus
// goes to the first unsure card left.
//
// Quick fix after Story 6.5: under the heading, a thumbnail of the photo the
// suggestions were read from ("Fotot av kylen", AnalyzedPhotoButton), which
// opens larger (AnalyzedPhotoSheet), so Pontus can check the reading; it is
// never stored (AD-15). The thumbnail goes with the last card and comes back
// with "Ångra". The sheet sits beside the section, so it stays open when the
// last card goes while it shows, until Pontus closes it; a focus move asked
// for meanwhile happens once it has closed.
//
// Story 6.6: once the points on the photo have come, each card shown that
// came from the reading has its number before its title ("Nummer 3 på
// fotot"), the large photo has the same numbers on the items, and a status
// under the thumbnail says first that they are looked up and then that they
// are there. "Syns inte längre" cards have none. Nothing waits for them.
//
// Story 8.4: the suggestions keep the place the photo was taken for. While
// Hemma shows another place, "Förslagen gäller Stugan." stands under the
// heading (a polite status, read out once when it appears); every write from
// the cards goes to the photo's place all the same.

// Kylfoto D: the cards are compact rows: the number, the name with the
// catalog name, "finns redan 2 dl" and the place under it, the amount, and a
// tick box, ticked from the start unless the model was unsure ("?") or the
// suggestion cannot be saved as it is. A tap on the row opens the sheet
// (Rätta), whose "Inte en vara" is Avvisa. One button under them, "Lägg till
// 3 varor" with "2 nya · 1 uppdateras" above it, saves the ticked rows as
// Bekräfta did one by one; "Fota igen" under it opens the camera again. The
// groups "Nytt" and "Ändrat" are one list; "Syns inte längre" keeps its cards.

/** No points yet. */
const noPoints: ReadonlyMap<number, PhotoPoint> = new Map();

export type PantrySuggestionListProps = {
  /** The place Hemma shows (Story 8.4): "Förslagen gäller Stugan." while the photo's place is another. */
  siteId: string;
};

export function PantrySuggestionList({ siteId }: PantrySuggestionListProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const {
    result,
    reviewPhoto,
    photoGone,
    arrivals,
    announce,
    cameraAreaRef,
    saving,
    savingIds,
    savingAll,
    confirmError,
    invalidIds,
    confirm,
    removeMissing,
    keepMissing,
    confirmButtonRef,
    confirmAllRef,
    flushFocus,
    dropPhotoNumbers,
  } = usePantrySuggestions();
  const { openSuggestion } = usePantrySheet();
  // What this mount has already moved focus for: a remount (another location
  // card) does not take focus for suggestions that came earlier.
  const handledArrivals = useRef(arrivals);
  const groups = result ? groupSuggestions(result) : null;
  const cardCount = groups ? groups.added.length + groups.changed.length + groups.missing.length : 0;

  // Which photo's sheet is open: a new photo's starts closed.
  const [openPhotoUrl, setOpenPhotoUrl] = useState<string | null>(null);
  const photoOpen = reviewPhoto !== null && openPhotoUrl === reviewPhoto.url;
  const photoWasOpen = useRef(false);
  // Kylfoto D: the tick boxes Pontus has changed; the others keep their start (ticked unless unsure).
  const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());

  // The photo's sheet has closed and given focus back: a focus move that waited for it happens now.
  useEffect(() => {
    if (photoWasOpen.current && !photoOpen) flushFocus({ afterSheet: true });
    photoWasOpen.current = photoOpen;
  }, [photoOpen, flushFocus]);

  // Mounted anew (another location card): a focus move asked for meanwhile happens now.
  useEffect(() => flushFocus(), [flushFocus]);

  // New suggestions: focus on the heading, so they are read out from the
  // start, while focus is still in the camera area (or nowhere). When Pontus
  // has moved on, e.g. into the sheet Lagervara, focus stays, and the camera's
  // live region says that they came.
  useEffect(() => {
    if (arrivals === handledArrivals.current) return;
    handledArrivals.current = arrivals;
    if (focusIsFree(cameraAreaRef.current)) headingRef.current?.focus();
    else if (result) announce(suggestionsArrivedText(result.location, cardCount));
  }, [arrivals, result, cardCount, announce, cameraAreaRef]);

  // Story 6.6: the photo's points, once they have come. One list of cards, the ones shown, gives the badges, the
  // markers and the status, as it gives the lookup (usePantryAnalysis).
  const numbers = reviewPhoto?.numbers ?? null;
  const points: ReadonlyMap<number, PhotoPoint> = numbers?.kind === "ready" ? numbers.points : noPoints;
  const shownCards = groups ? numberedCards(groups) : [];
  const markers = photoMarkers(shownCards, points);
  const hasNumbers = shownCards.some((card) => cardNumber(card, points) !== null);
  const statusTarget = numbers ? photoNumbersStatus(numbers, hasNumbers) : "";
  // The status region is there, empty, before its text: the text is written after the commit that mounted it, so
  // it is announced. React renders the region without children, so it never writes over the text.
  const statusRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (statusRef.current && statusRef.current.textContent !== statusTarget) statusRef.current.textContent = statusTarget;
  });
  /** A card's number, the empty place of one being looked up, or nothing. */
  const photoNumberOf = (suggestion: PantrySuggestion): number | "pending" | null => {
    if (!numbers || (suggestion.itemNumbers ?? []).length === 0) return null;
    if (numbers.kind === "pending") return "pending";
    return cardNumber(suggestion, points);
  };

  // Always in the same place of the tree, with or without the section, so an open sheet stays open.
  const photoSheet =
    reviewPhoto && result ? (
      <AnalyzedPhotoSheet
        key={reviewPhoto.url}
        photo={reviewPhoto}
        location={result.location}
        open={photoOpen}
        onClose={() => setOpenPhotoUrl(null)}
        markers={markers}
        onPhotoError={() => dropPhotoNumbers(reviewPhoto.url)}
      />
    ) : null;
  if (!result || !groups || cardCount === 0) {
    return (
      <>
        {null}
        {photoSheet}
      </>
    );
  }
  const { added, changed, unchanged, missing, compared, incomplete } = groups;
  const rows = [...added, ...changed];
  const isTicked = (suggestion: PantrySuggestion) =>
    !invalidIds.has(suggestion.id) && (ticks.get(suggestion.id) ?? isBulkConfirmable(suggestion));
  const ticked = rows.filter(isTicked);
  const updated = ticked.filter((suggestion) => suggestion.current).length;
  // "Fota igen": the camera's own file input (the camera on a phone, else the picker).
  const retake = () => cameraAreaRef.current?.querySelector<HTMLInputElement>('input[type="file"]')?.click();
  return (
    <>
      <section aria-labelledby={headingId} data-testid="pantry-suggestions" className="flex flex-col gap-3">
        {confirmError ? <Notice role="alert">{confirmError.message}</Notice> : null}
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-section-label text-ink-2">
          {suggestionsHeading(result.location)}
        </h2>
        {/* Story 8.4: mounted empty, so the line is announced once when Hemma shows another place than the photo's. */}
        <p role="status" data-testid="pantry-suggestions-site" className="text-body text-ink break-words empty:hidden">
          {result.site && result.site.id !== siteId ? suggestionsSiteText(result.site.name) : null}
        </p>
        {/* Story 12.5: the cards came without the photo (after a reload): nothing to compare with, and no latest photo is saved. */}
        {photoGone ? <p className="text-meta text-ink-2">{analyzedPhotoGoneText}</p> : null}
        {reviewPhoto ? (
          <AnalyzedPhotoButton
            photo={reviewPhoto}
            location={result.location}
            onOpen={() => setOpenPhotoUrl(reviewPhoto.url)}
            onPhotoError={() => dropPhotoNumbers(reviewPhoto.url)}
          />
        ) : null}
        {/* Story 6.6: says politely that the numbers are looked up, and that they have come. Always there with the
            section, empty and taking no room otherwise, so a screen reader hears the text when it comes. */}
        {numbers?.kind === "pending" ? (
          <div aria-hidden="true">
            <AiWorking size="sm" inLiveRegion steps={locatingSteps} />
          </div>
        ) : null}
        <p
          ref={statusRef}
          role="status"
          data-testid="pantry-photo-numbers-status"
          className={cx("text-meta text-ink-2 empty:-mt-3", numbers?.kind === "pending" && "sr-only")}
        />
        {compared && unchanged > 0 ? <p className="text-body text-ink-2">{unchangedCountText(unchanged)}</p> : null}
        {result.inventory.kind === "unread" ? (
          <p className="text-body text-ink-2">
            {result.inventory.changed ? changedPlaceText(result.location) : unreadPlaceText(result.location)}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <ul className="flex flex-col overflow-hidden rounded-lg bg-surface">
            {rows.map((suggestion) => (
              <SuggestionRow
                key={suggestion.id}
                suggestion={suggestion}
                disabled={saving}
                saving={savingIds.has(suggestion.id)}
                invalid={invalidIds.has(suggestion.id)}
                ticked={isTicked(suggestion)}
                onTick={(tick) => setTicks((before) => new Map(before).set(suggestion.id, tick))}
                photoNumber={photoNumberOf(suggestion)}
                rowRef={confirmButtonRef(suggestion.id)}
                onCorrect={() => openSuggestion(suggestion)}
              />
            ))}
          </ul>
        ) : null}
        {compared ? (
          <Group title="Syns inte längre" hidden={missing.length === 0} note={incomplete ? incompleteComparisonText : null}>
            {missing.map((item) => (
              <MissingCard
                key={item.id}
                item={item}
                disabled={saving}
                saving={savingIds.has(item.id)}
                removeRef={confirmButtonRef(item.id)}
                onRemove={() => removeMissing(item.id)}
                onKeep={() => keepMissing(item.id)}
              />
            ))}
          </Group>
        ) : null}
        {rows.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <p data-testid="pantry-suggestions-summary" className="text-center text-meta text-ink-2">
              {checkedSummaryText(ticked.length - updated, updated)}
            </p>
            <Button
              ref={confirmAllRef}
              fullWidth
              disabled={saving || ticked.length === 0}
              onClick={() => confirm(ticked.map((suggestion) => suggestion.id), { all: true })}
            >
              {savingAll ? "Sparar …" : addCheckedText(ticked.length)}
            </Button>
            <Button variant="text" fullWidth disabled={saving} onClick={retake}>
              Fota igen
            </Button>
          </div>
        ) : null}
      </section>
      {photoSheet}
    </>
  );
}

/** One of the groups of a compared photo: an h3, an optional note under it, and its cards; nothing when empty. */
function Group({
  title,
  hidden,
  note = null,
  children,
}: {
  title: string;
  hidden: boolean;
  note?: string | null;
  children: ReactNode;
}) {
  if (hidden) return null;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-row-title text-ink">{title}</h3>
      {note ? <p className="text-body text-ink-2">{note}</p> : null}
      <ul className="flex flex-col gap-3">{children}</ul>
    </div>
  );
}

type SuggestionRowProps = {
  suggestion: PantrySuggestion;
  /** A confirmation is being saved: nothing here works. */
  disabled: boolean;
  /** This suggestion is being saved. */
  saving: boolean;
  /** It cannot be saved as it is: the box stays empty until Rätta. */
  invalid: boolean;
  ticked: boolean;
  onTick: (ticked: boolean) => void;
  /** Story 6.6: its number on the photo, "pending" while the numbers are looked up (its place is kept), or `null`. */
  photoNumber: number | "pending" | null;
  rowRef: (button: HTMLButtonElement) => () => void;
  onCorrect: () => void;
};

/**
 * Kylfoto D: one suggestion as a compact row. The whole row is the button
 * that opens the sheet ("Rätta Mjölk"); the tick box sits above it.
 */
function SuggestionRow({
  suggestion,
  disabled,
  saving,
  invalid,
  ticked,
  onTick,
  photoNumber,
  rowRef,
  onCorrect,
}: SuggestionRowProps) {
  const { name, location, current, uncertain } = suggestion;
  const { title, ingredientName } = suggestionTitle(suggestion);
  const line = [ingredientName ? catalogName(ingredientName) : null, current ? alreadyHereText(current) : null, location].filter(Boolean).join(" · ");
  return (
    <li
      data-testid="pantry-suggestion"
      className="relative flex min-h-[60px] items-center gap-3 border-t border-hairline py-2 pr-1 pl-4 first:border-t-0"
    >
      <button
        ref={rowRef}
        type="button"
        disabled={disabled}
        onClick={onCorrect}
        aria-label={`Rätta ${name}`}
        className="absolute inset-0 -outline-offset-2"
      />
      {photoNumber === null ? null : <PhotoNumberBadge number={photoNumber === "pending" ? null : photoNumber} />}
      <div className="min-w-0 flex-1">
        <h3 className={cx("flex items-center gap-1.5 text-row-title break-words", ticked ? "text-ink" : "text-ink-2")}>
          <span className="min-w-0">{title}</span>
          {uncertain ? (
            <>
              <span
                aria-hidden="true"
                className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full bg-sand text-[12px] font-bold text-sand-ink"
              >
                ?
              </span>
              <span className="sr-only">, {uncertainBadgeText.toLowerCase()}</span>
            </>
          ) : null}
          {typeof photoNumber === "number" ? <PhotoNumberText number={photoNumber} /> : null}
        </h3>
        <p className="text-meta break-words text-ink-2">{line}</p>
        {invalid ? <p className="text-meta text-ink-2">{suggestionInvalidText}</p> : null}
      </div>
      <span className={cx("shrink-0 text-meta", ticked ? "text-ink-2" : "text-ink-3")}>
        {saving ? "Sparar …" : suggestionAmountText(suggestion)}
      </span>
      <Checkbox
        checked={ticked}
        onCheckedChange={onTick}
        label={`Ta med ${name}`}
        disabled={disabled || invalid}
        className="relative z-10"
      />
    </li>
  );
}

type MissingCardProps = {
  item: MissingItem;
  /** A confirmation is being saved: no button works. */
  disabled: boolean;
  /** This item is being removed. */
  saving: boolean;
  removeRef: (button: HTMLButtonElement) => () => void;
  onRemove: () => void;
  onKeep: () => void;
};

/** "Syns inte längre": the item, what the place has of it, "Ta bort" and "Behåll". No Rätta: "Behåll" and the list do that. */
function MissingCard({ item, disabled, saving, removeRef, onRemove, onKeep }: MissingCardProps) {
  const { name, location, stock } = item;
  return (
    <li data-testid="pantry-missing" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <h4 className="min-w-0 text-row-title break-words text-ink">{name}</h4>
      <p className="text-meta text-ink-2">{currentAmountText(location, stock)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          ref={removeRef}
          variant="secondary"
          disabled={disabled}
          onClick={onRemove}
          {...(saving ? {} : { "aria-label": `Ta bort ${name}` })}
        >
          {saving ? "Sparar …" : "Ta bort"}
        </Button>
        <Button variant="text" disabled={disabled} onClick={onKeep} aria-label={`Behåll ${name}`}>
          Behåll
        </Button>
      </div>
    </li>
  );
}
