"use client";

import { type ReactNode, useEffect, useId, useRef } from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { Notice } from "@/components/notice";
import {
  changedPlaceText,
  changeSpokenText,
  changeText,
  currentAmountText,
  incompleteComparisonText,
  suggestionAmountText,
  suggestionsArrivedText,
  suggestionInvalidText,
  suggestionsHeading,
  unchangedCountText,
  unreadPlaceText,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { groupSuggestions, type MissingItem } from "../domain/place-inventory";
import { usePantrySheet } from "./pantry-item-sheet";
import { usePantrySuggestions } from "./pantry-suggestions";
import { focusIsFree } from "./use-pantry-analysis";

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
// stämmer med lagret.", no cards for them) and the groups "Nytt", "Ändrat"
// and "Syns inte längre" (h3, an empty group is left out). An "Ändrat" card
// shows "nu: 2 förp → bilden: 1 förp" instead of "I kylen nu"; a "Syns inte
// längre" card shows what the place has, with "Ta bort" (primary) and
// "Behåll". Focus moves through the cards in that order. An empty place, or
// one that could not be read ("Det gick inte att jämföra med lagret i
// kylen."), shows the plain list.

export function PantrySuggestionList() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const {
    result,
    arrivals,
    announce,
    cameraAreaRef,
    saving,
    savingIds,
    savingAll,
    confirmError,
    invalidIds,
    confirm,
    reject,
    removeMissing,
    keepMissing,
    confirmButtonRef,
    confirmAllRef,
    flushFocus,
  } = usePantrySuggestions();
  const { openSuggestion } = usePantrySheet();
  // What this mount has already moved focus for: a remount (another location
  // card) does not take focus for suggestions that came earlier.
  const handledArrivals = useRef(arrivals);
  const groups = result ? groupSuggestions(result) : null;
  const cardCount = groups ? groups.added.length + groups.changed.length + groups.missing.length : 0;

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

  if (!result || !groups || cardCount === 0) return null;
  const { added, changed, unchanged, missing, compared, incomplete } = groups;
  const confirmable = [...added, ...changed].filter((suggestion) => !invalidIds.has(suggestion.id));
  const card = (suggestion: PantrySuggestion, level: 3 | 4) => (
    <SuggestionCard
      key={suggestion.id}
      suggestion={suggestion}
      level={level}
      disabled={saving}
      saving={savingIds.has(suggestion.id)}
      invalid={invalidIds.has(suggestion.id)}
      confirmRef={confirmButtonRef(suggestion.id)}
      onConfirm={() => confirm([suggestion.id])}
      onCorrect={() => openSuggestion(suggestion)}
      onReject={() => reject(suggestion.id)}
    />
  );
  return (
    <section aria-labelledby={headingId} data-testid="pantry-suggestions" className="flex flex-col gap-3">
      {confirmError ? <Notice role="alert">{confirmError.message}</Notice> : null}
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className="text-section-label text-ink-2">
        {suggestionsHeading(result.location)}
      </h2>
      <Button
        ref={confirmAllRef}
        variant="secondary"
        // An incomplete comparison removes nothing with "Bekräfta alla".
        disabled={saving || (confirmable.length === 0 && (missing.length === 0 || incomplete))}
        onClick={() => confirm(confirmable.map((suggestion) => suggestion.id), { all: true })}
        className="self-start"
      >
        {savingAll ? "Sparar …" : "Bekräfta alla"}
      </Button>
      {compared && unchanged > 0 ? <p className="text-body text-ink-2">{unchangedCountText(unchanged)}</p> : null}
      {result.inventory.kind === "unread" ? (
        <p className="text-body text-ink-2">
          {result.inventory.changed ? changedPlaceText(result.location) : unreadPlaceText(result.location)}
        </p>
      ) : null}
      {compared ? (
        <>
          <Group title="Nytt" hidden={added.length === 0}>
            {added.map((suggestion) => card(suggestion, 4))}
          </Group>
          <Group title="Ändrat" hidden={changed.length === 0}>
            {changed.map((suggestion) => card(suggestion, 4))}
          </Group>
          <Group
            title="Syns inte längre"
            hidden={missing.length === 0}
            note={incomplete ? incompleteComparisonText : null}
          >
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
        </>
      ) : (
        <ul className="flex flex-col gap-3">{added.map((suggestion) => card(suggestion, 3))}</ul>
      )}
    </section>
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

type SuggestionCardProps = {
  suggestion: PantrySuggestion;
  /** The heading level of the name: 3 in the plain list, 4 under a group's h3. */
  level: 3 | 4;
  /** A confirmation is being saved: no button works. */
  disabled: boolean;
  /** This suggestion is being saved. */
  saving: boolean;
  /** It cannot be confirmed as it is: only Rätta and Avvisa. */
  invalid: boolean;
  confirmRef: (button: HTMLButtonElement) => () => void;
  onConfirm: () => void;
  onCorrect: () => void;
  onReject: () => void;
};

function SuggestionCard({
  suggestion,
  level,
  disabled,
  saving,
  invalid,
  confirmRef,
  onConfirm,
  onCorrect,
  onReject,
}: SuggestionCardProps) {
  const { name, ingredient, location, current, change } = suggestion;
  const Heading = level === 3 ? "h3" : "h4";
  let now = null;
  if (current && change === "changed") {
    // The arrow is not read out; the screen reader hears "I kylen nu: 2 förp. På bilden: 1 förp."
    now = (
      <p className="text-meta text-ink-2">
        <span className="sr-only">{changeSpokenText(location, current, suggestion)}</span>
        <span aria-hidden="true">{changeText(current, suggestion)}</span>
      </p>
    );
  } else if (current) {
    now = <p className="text-meta text-ink-2">{currentAmountText(location, current)}</p>;
  }
  return (
    <li data-testid="pantry-suggestion" className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <Heading className="min-w-0 text-row-title break-words text-ink">{name}</Heading>
        {ingredient.kind === "new" ? (
          <Badge tone="neutral" className="shrink-0">
            Ny
          </Badge>
        ) : null}
      </div>
      <p className="text-body text-ink-2">
        <span>{suggestionAmountText(suggestion)}</span> · <span>{location}</span>
      </p>
      {now}
      {invalid ? <p className="text-meta text-ink-2">{suggestionInvalidText}</p> : null}
      {/* The buttons wrap at 200 % text; the names say which suggestion they are for. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Button
          ref={confirmRef}
          disabled={disabled || invalid}
          onClick={onConfirm}
          {...(saving ? {} : { "aria-label": `Bekräfta ${name}` })}
        >
          {saving ? "Sparar …" : "Bekräfta"}
        </Button>
        <Button variant="text" disabled={disabled} onClick={onCorrect} aria-label={`Rätta ${name}`}>
          Rätta
        </Button>
        <Button variant="text" disabled={disabled} onClick={onReject} aria-label={`Avvisa ${name}`}>
          Avvisa
        </Button>
      </div>
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
