"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { Checkbox } from "@/components/checkbox";
import { ChevronRightIcon } from "@/components/icons";
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
  markerSelectedText,
  missingHintText,
  missingToggleText,
  removeCheckedText,
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
import {
  AnalyzedPhotoSheet,
  PhotoNumberBadge,
  PhotoNumberText,
  type PhotoCropProps,
  type ReviewMarker,
  ReviewPhotoPanel,
} from "./analyzed-photo";
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
// groups "Nytt" and "Ändrat" are one list.
//
// Kylfoto D, the rest: the photo sits on top with the rows' numbers
// (ReviewPhotoPanel), sticks while the list scrolls and shrinks. A tap on a
// marker lights up its row (soft mint) and scrolls it into view, and says so
// politely; a tap on a row lights up its marker and opens the sheet, with the
// photo around the item at its top (PhotoCrop). "Syns inte längre" is one
// folded row, "Syns inte längre (2)"; unfolded, each item has a tick box,
// empty from the start, and the ticked ones are removed by the same button,
// whose line then says "1 tas bort". Nothing is removed without a tick.

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
    reviewPhotos,
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
    resultGeneration,
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
  const photoOpen = openPhotoUrl !== null && reviewPhotos.some((photo) => photo.url === openPhotoUrl);
  const photoWasOpen = useRef(false);
  // Kylfoto D: the tick boxes Pontus has changed; the others keep their start (ticked unless unsure).
  const [ticks, setTicks] = useState<ReadonlyMap<string, boolean>>(new Map());
  // Kylfoto D: the "Syns inte längre" items ticked to go, for one generation of suggestions; none from the start.
  const [removals, setRemovals] = useState<{ generation: number; ids: ReadonlySet<string> }>({
    generation: resultGeneration,
    ids: new Set(),
  });
  const [missingOpen, setMissingOpen] = useState(false);
  const missingListId = useId();
  // Kylfoto D: the number lit up on the photo and in the list, for one photo.
  const [selection, setSelection] = useState<{ url: string; number: number } | null>(null);
  // Kylfoto, flera foton: the photo shown large, by its URL; the first unless another is chosen.
  const [chosenUrl, setChosenUrl] = useState<string | null>(null);
  const shownPhoto = reviewPhotos.find((photo) => photo.url === chosenUrl) ?? reviewPhoto;
  const selected = selection && selection.url === reviewPhoto?.url ? selection.number : null;
  /** Said politely when a marker lights up its row. */
  const [selectedNote, setSelectedNote] = useState("");
  const rowElements = useRef(new Map<number, HTMLLIElement>());

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
  // Kylfoto, flera foton: the numbers run on over the photos, so every photo has the same; one that cannot be shown has none.
  const numbers = (reviewPhotos.find((photo) => photo.numbers.kind !== "none") ?? reviewPhoto)?.numbers ?? null;
  const points: ReadonlyMap<number, PhotoPoint> = numbers?.kind === "ready" ? numbers.points : noPoints;
  const shownCards = groups ? numberedCards(groups) : [];
  const allMarkers = photoMarkers(shownCards, points);
  /** The markers on the photo shown: those of its item numbers (all of them for a reading of one photo). */
  const markers = allMarkers.filter((marker) => {
    const range = shownPhoto?.range;
    return shownPhoto?.numbers.kind !== "none" && (!range || (marker.key >= range.first && marker.key <= range.last));
  });
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
    shownPhoto && result ? (
      <AnalyzedPhotoSheet
        key={shownPhoto.url}
        photo={shownPhoto}
        location={result.location}
        open={photoOpen}
        onClose={() => setOpenPhotoUrl(null)}
        markers={markers}
        onPhotoError={() => dropPhotoNumbers(shownPhoto.url)}
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
  const removalIds = removals.generation === resultGeneration ? removals.ids : noIds;
  const removing = compared ? missing.filter((item) => removalIds.has(item.id)) : [];
  const tickRemoval = (id: string, tick: boolean) =>
    setRemovals((before) => {
      const ids = new Set(before.generation === resultGeneration ? before.ids : []);
      if (tick) ids.add(id);
      else ids.delete(id);
      return { generation: resultGeneration, ids };
    });
  const showsButton = rows.length > 0 || (compared && missing.length > 0);

  // Kylfoto D: the rows by their number, and the markers with their row's name and tick.
  const rowByNumber = new Map<number, PantrySuggestion>();
  for (const suggestion of rows) {
    const number = cardNumber(suggestion, points);
    if (number !== null && !rowByNumber.has(number)) rowByNumber.set(number, suggestion);
  }
  const reviewMarkers: ReviewMarker[] = markers.flatMap((marker) => {
    const row = rowByNumber.get(marker.label);
    if (!row) return [];
    const tone = isTicked(row) ? "on" : row.uncertain ? "unsure" : "off";
    return [{ ...marker, name: row.name, tone }];
  });
  /** A tap on a marker: lights up its row (or puts it out), scrolls it into view, and says so. */
  const selectMarker = (number: number) => {
    if (!reviewPhoto) return;
    const row = rowByNumber.get(number);
    if (selected === number || !row) {
      setSelection(null);
      setSelectedNote("");
      return;
    }
    setSelection({ url: reviewPhoto.url, number });
    setSelectedNote(markerSelectedText(number, row.name));
    rowElements.current.get(number)?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  /**
   * A tap on a row: lights up its marker and opens the sheet, with the photo around the item. Kylfoto, flera foton:
   * the photo its marker is on is shown large.
   */
  const openRow = (suggestion: PantrySuggestion) => {
    const number = cardNumber(suggestion, points);
    let crop: PhotoCropProps | undefined;
    if (reviewPhoto && number !== null) {
      const onPhoto = reviewPhotos.find((photo) => photo.range && number >= photo.range.first && number <= photo.range.last) ?? reviewPhoto;
      setChosenUrl(onPhoto.url);
      setSelection({ url: reviewPhoto.url, number });
      setSelectedNote("");
      const point = points.get(number);
      if (point) crop = { url: onPhoto.url, x: point.x, y: point.y, number };
    }
    openSuggestion(suggestion, crop);
  };
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
        {shownPhoto ? (
          <ReviewPhotoPanel
            photo={shownPhoto}
            photos={reviewPhotos}
            onChoosePhoto={setChosenUrl}
            location={result.location}
            markers={reviewMarkers}
            selected={selected}
            onSelectMarker={selectMarker}
            onOpen={() => setOpenPhotoUrl(shownPhoto.url)}
            onPhotoError={() => dropPhotoNumbers(shownPhoto.url)}
          />
        ) : null}
        {/* Kylfoto D: mounted with the section, so a marker's tap is said when its row lights up. */}
        <p role="status" data-testid="pantry-review-selected" className="sr-only">
          {selectedNote}
        </p>
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
                selected={selected !== null && cardNumber(suggestion, points) === selected}
                itemRef={(element) => {
                  const number = cardNumber(suggestion, points);
                  if (number === null) return;
                  if (element) rowElements.current.set(number, element);
                  else if (rowElements.current.get(number)?.isConnected === false) rowElements.current.delete(number);
                }}
                disabled={saving}
                saving={savingIds.has(suggestion.id)}
                invalid={invalidIds.has(suggestion.id)}
                ticked={isTicked(suggestion)}
                onTick={(tick) => setTicks((before) => new Map(before).set(suggestion.id, tick))}
                photoNumber={photoNumberOf(suggestion)}
                rowRef={confirmButtonRef(suggestion.id)}
                onCorrect={() => openRow(suggestion)}
              />
            ))}
          </ul>
        ) : null}
        {compared && missing.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3>
              <button
                type="button"
                aria-expanded={missingOpen}
                aria-controls={missingListId}
                data-testid="pantry-missing-toggle"
                onClick={() => setMissingOpen((open) => !open)}
                className="flex min-h-tap w-full items-center justify-between gap-2 rounded-lg bg-surface py-2 pr-3 pl-4 text-left text-body text-ink-2"
              >
                {missingToggleText(missing.length)}
                <ChevronRightIcon
                  size={18}
                  className={cx("shrink-0 text-ink-3 transition-transform motion-reduce:transition-none", missingOpen && "rotate-90")}
                />
              </button>
            </h3>
            <div id={missingListId} hidden={!missingOpen} className="flex flex-col gap-2">
              {incomplete ? <p className="text-body text-ink-2">{incompleteComparisonText}</p> : null}
              <ul className="flex flex-col overflow-hidden rounded-lg bg-surface">
                {missing.map((item) => (
                  <MissingRow
                    key={item.id}
                    item={item}
                    disabled={saving}
                    saving={savingIds.has(item.id)}
                    ticked={removalIds.has(item.id)}
                    onTick={(tick) => tickRemoval(item.id, tick)}
                  />
                ))}
              </ul>
              <p className="px-1 text-meta text-ink-2">{missingHintText}</p>
            </div>
          </div>
        ) : null}
        {showsButton ? (
          <div className="flex flex-col gap-2 border-t border-hairline pt-3">
            <p data-testid="pantry-suggestions-summary" className="text-center text-meta text-ink-2">
              {checkedSummaryText(ticked.length - updated, updated, removing.length)}
            </p>
            <Button
              ref={confirmAllRef}
              fullWidth
              disabled={saving || ticked.length + removing.length === 0}
              onClick={() =>
                confirm(
                  ticked.map((suggestion) => suggestion.id),
                  { all: true, remove: removing.map((item) => item.id) },
                )
              }
            >
              {savingAll
                ? "Sparar …"
                : rows.length === 0
                  ? removeCheckedText(removing.length)
                  : addCheckedText(ticked.length, removing.length)}
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

type SuggestionRowProps = {
  suggestion: PantrySuggestion;
  /** Kylfoto D: its marker is lit on the photo: a soft mint background. */
  selected: boolean;
  /** Kylfoto D: the row's element, so a marker's tap can scroll it into view. */
  itemRef: (element: HTMLLIElement | null) => void;
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
  selected,
  itemRef,
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
      ref={itemRef}
      data-testid="pantry-suggestion"
      data-selected={selected || undefined}
      // Kept clear of the slim bar and the photo that stick above the list, and of the tab bar, when scrolled into view.
      className={cx(
        "relative flex min-h-[60px] scroll-mt-[calc(272px+env(safe-area-inset-top))] scroll-mb-[calc(var(--tab-bar-height)+16px)] items-center gap-3 border-t border-hairline py-2 pr-1 pl-4 transition-colors duration-200 first:border-t-0 motion-reduce:transition-none desktop:scroll-mt-[224px] desktop:scroll-mb-4",
        selected && "bg-mint/60",
      )}
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

type MissingRowProps = {
  item: MissingItem;
  /** A confirmation is being saved: the box does not work. */
  disabled: boolean;
  /** This item is being removed. */
  saving: boolean;
  /** Ticked to go with the button. */
  ticked: boolean;
  onTick: (ticked: boolean) => void;
};

/** Kylfoto D: one "Syns inte längre" item: its name, what the place has of it, and a tick box to remove it. */
function MissingRow({ item, disabled, saving, ticked, onTick }: MissingRowProps) {
  const { name, location, stock } = item;
  return (
    <li
      data-testid="pantry-missing"
      className="flex min-h-12 items-center gap-3 border-t border-hairline py-1.5 pr-1 pl-4 first:border-t-0"
    >
      <div className="min-w-0 flex-1">
        <h4 className={cx("text-body break-words", ticked ? "text-ink" : "text-ink-2")}>{name}</h4>
        <p className="text-meta text-ink-2">{saving ? "Sparar …" : currentAmountText(location, stock)}</p>
      </div>
      <Checkbox checked={ticked} onCheckedChange={onTick} label={`Ta bort ${name}`} disabled={disabled} />
    </li>
  );
}

/** Whether Pontus has asked for less motion: a marker's row then jumps into view. */
function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const noIds: ReadonlySet<string> = new Set();
