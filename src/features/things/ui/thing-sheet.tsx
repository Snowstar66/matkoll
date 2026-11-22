"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { PhotoViewer } from "@/features/pantry";
import { useOption } from "@/lib/use-option";
import { Button } from "@/components/button";
import { ChoiceRows } from "@/components/choice-rows";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { setThingCount } from "../actions/thing-count";
import { loadThingDetail } from "../actions/thing-detail";
import { removeThing, restoreThing, updateThing } from "../actions/thing-item";
import { cardViewHref } from "../domain/thing-card";
import { cardPhotoMarkers, numberOnCard, thingCrumbs, type ThingDetail } from "../domain/thing-detail";
import { thingCategories, thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import {
  categoryLabelText,
  cleanThingName,
  countInvalidText,
  emptyNameText,
  maxThingNameChars,
  nameFieldText,
  openWholeCardText,
  openCardPageText,
  photoViewerAltText,
  photoViewerTitleText,
  showWholeCardText,
  placeCrumbsLabel,
  saveNameText,
  removedThingText,
  removeThingText,
  thingSheetTitleText,
} from "../domain/thing-edit";
import { notedSheetSubtitle } from "../domain/thing-noted";
import { maxCount } from "../domain/thing-count";
import { WorthBlock } from "./worth-marker";
import { CountCard } from "./count-card";
import { addRemovedThing, hasRemovedThingsHost } from "./removed-things";

// Föremålets blad (Stories 18.3, 18.15 and 18.23; Pontus 1, 9 and 20 Nov): one sheet
// for a föremål wherever it is tapped, in a room's list, a search hit or on its
// card. From the top: the card's photo with the föremål's box marked, large (a tap
// opens the whole card; a tile with the category's emoji when there is no photo),
// where it is kept as crumbs, "Vad är det?" (the name is a free field: a föremål
// the AI got wrong is renamed at once), the count (a field to write it in when the
// föremål is not counted, "Spara" beside it; for a counted one Ta, Fyll på and the
// history, saved at once), and last two quiet lines, "Kategori" and "Ta bort
// föremålet", which goes at once with "Tog bort X." and Ångra. There is no "Var på
// bilden" any more (the AI's hint stays in the database, unchanged). Spara is one
// small button, shown only when the name or a typed count has changed. A picked
// category closes the sheet: the föremål moves to another group of its list. The photo and the place are read when the
// sheet opens; if that fails the rest still works.

/** What the sheet needs of a föremål. */
export type SheetThing = Pick<Thing, "id" | "name" | "category" | "whereHint" | "confidence"> & Pick<Partial<Thing>, "seenOn" | "noted" | "quantity"> & {
    /** The card it is seen on, when the opener knows it (a search hit): the photo shows at once. */
    photoId?: string | null;
  };

/** What happened in the sheet, for a list that keeps its own copy of the föremål (the search hits). */
export type ThingSheetEvent =
  | { kind: "saved"; id: string; name: string; category: ThingCategory; whereHint: string | null }
  | { kind: "removed"; id: string }
  | { kind: "restored"; id: string }
  | { kind: "counted"; id: string; quantity: number | null };

export type ThingSheetProps = {
  thing: SheetThing | null;
  open: boolean;
  onClose: () => void;
  /** The line under the name; by default where it is on the picture, or for a noted föremål when and where it was written in. */
  subtitle?: string;
  /** "Visa på kortet ›" (or "Visa i rummet ›" for a noted föremål): where the föremål is shown; none on the card itself. */
  link?: { href: string; label: string } | null;
  onEvent?: (event: ThingSheetEvent) => void;
};

function defaultSubtitle(thing: SheetThing): string | undefined {
  // Where on the picture is no longer said here (Pontus 20 Nov); only a noted föremål says when and where it was written in.
  if (thing.noted) return notedSheetSubtitle(thing.noted.part, new Date(thing.noted.at));
  return undefined;
}

type Step = "main" | "category";

/** Matvaror's zoom (125 % of the sheet's width) is the least; a small box is enlarged until it fills about half the width. */
const minCropZoom = 1.25;
const maxCropZoom = 2.5;

/** Where a background of `zoom` times the box's width sits (in percent) to put the photo's point `at` (0-1) in the middle. */
function centeredPosition(at: number, zoom: number): number {
  return Math.min(1, Math.max(0, (0.5 - at * zoom) / (1 - zoom))) * 100;
}

/**
 * The top of a föremål's sheet, like Matvaror's "Ändra vara": the photo enlarged around the föremål (no frame, no
 * shading), square, and "Visa hela kortet" under it. Both lead to the whole card. The box is a share of the photo,
 * so the crop is right at any size. Without a box the whole photo shows.
 */
function ThingPhoto({
  photoId,
  thingId,
  box,
  canView,
  onView,
  onOpen,
}: {
  photoId: string;
  thingId: string;
  box: ThingDetail["box"];
  /** The card's numbers are known: the photo and "Visa hela kortet" open the photo view; otherwise they lead to the card's page. */
  canView: boolean;
  onView: (zoomed: boolean) => void;
  onOpen: () => void;
}) {
  const href = cardViewHref(photoId, thingId);
  // The photo is served by the route that checks the user; nothing is fetched from anywhere else.
  const url = `/api/things/photo/${photoId}`;
  const zoom = box ? Math.min(maxCropZoom, Math.max(minCropZoom, 0.5 / Math.max(box.width, 0.01))) : 1;
  const picture = box ? (
    <div
      aria-hidden="true"
      data-testid="thing-photo-crop"
      className="aspect-square max-h-[320px] w-full"
      style={{
        backgroundImage: `url("${url}")`,
        backgroundSize: `${zoom * 100}% auto`,
        backgroundPosition: `${centeredPosition(box.left + box.width / 2, zoom)}% ${centeredPosition(box.top + box.height / 2, zoom)}%`,
        backgroundRepeat: "no-repeat",
      }}
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="mx-auto block max-h-[55svh] w-auto max-w-full" draggable={false} />
  );
  const frameClass = "block w-full overflow-hidden rounded-[14px] bg-border";
  const wholeClass = "-ml-2 inline-flex min-h-tap w-fit items-center rounded-md px-2 text-[0.9375rem] font-medium text-accent";
  return (
    <div className="flex flex-col gap-1">
      {canView ? (
        // The same photo view as in Matvaror: the photo zoomed in on this föremål, the whole card with every number one tap away.
        <button type="button" onClick={() => onView(box !== null)} aria-haspopup="dialog" aria-label={openWholeCardText} className={frameClass} data-testid="thing-photo">
          {picture}
        </button>
      ) : (
        <Link href={href} onClick={onOpen} aria-label={openWholeCardText} className={frameClass} data-testid="thing-photo">
          {picture}
        </Link>
      )}
      {canView ? (
        <button type="button" onClick={() => onView(false)} aria-haspopup="dialog" data-testid="thing-photo-whole" className={wholeClass}>
          {showWholeCardText}
        </button>
      ) : (
        <Link href={href} onClick={onOpen} data-testid="thing-photo-whole" className={wholeClass}>
          {showWholeCardText}
        </Link>
      )}
    </div>
  );
}

export function ThingSheet({ thing, open, onClose, subtitle, link, onEvent }: ThingSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  // What the föremål is now: from the opener, then as saved in the sheet.
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ThingCategory>("Övrigt");
  // The text in "Vad är det?", and the count typed in when the föremål is not counted.
  const [nameDraft, setNameDraft] = useState("");
  const [countDraft, setCountDraft] = useState("");
  const [countError, setCountError] = useState<string | null>(null);
  // The count as read and after each change (null when not counted).
  const [counted, setCounted] = useState<number | null>(null);
  // The category the check is on in its step (the arrow keys move it; a pick saves it).
  const [choice, setChoice] = useState<ThingCategory>("Övrigt");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<Step>("main");
  // Each opening starts from the föremål as it is now, with its count and detail read again.
  const [session, setSession] = useState<{ id: string; at: number } | null>(null);
  // The photo and place: `undefined` until read, `null` when they could not be read (the rest of the sheet works anyway).
  const [detail, setDetail] = useState<{ key: string; value: ThingDetail | null } | undefined>(undefined);
  // The photo view, replacing the sheet while it shows ("Klar" comes back to the sheet, whose fields are as they were).
  const [photoView, setPhotoView] = useState<{ zoomed: boolean; opened: number } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const categoryRowRef = useRef<HTMLButtonElement>(null);
  const lastStep = useRef<Step>("main");
  const ids = useId();
  const thingId = thing?.id ?? null;
  const sessionAt = session?.at ?? 0;
  const detailKey = `${thingId}-${sessionAt}`;

  // Focus follows the step: the chosen category going deeper, the line that opened the step when coming back.
  useEffect(() => {
    if (step === "category") categoriesRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    else if (lastStep.current !== "main") categoryRowRef.current?.focus();
    lastStep.current = step;
  }, [step]);

  // The photo and the place; an answer for another föremål, or one that comes after the sheet moved on, is ignored.
  useEffect(() => {
    if (!open || !thingId) return;
    let current = true;
    void (async () => {
      let value: ThingDetail | null = null;
      try {
        const result = await loadThingDetail(thingId);
        if (result.ok) value = result.data;
      } catch {
        value = null;
      }
      if (current) setDetail({ key: detailKey, value });
    })();
    return () => {
      current = false;
    };
  }, [open, thingId, detailKey]);

  if (open && thing && session?.id !== thing.id) {
    setSession({ id: thing.id, at: sessionAt + 1 });
    setName(thing.name);
    setNameDraft(thing.name);
    setCategory(thing.category);
    setCountDraft("");
    setCountError(null);
    setCounted(thing.quantity ?? null);
    setFieldError(null);
    setNotice(null);
    setStep("main");
  }
  if (!open && session !== null && session.id !== "") {
    setSession({ id: "", at: session.at });
    // Closed one level deeper (Esc, a swipe): the next opening starts at the top.
    setStep("main");
  }

  const noted = Boolean(thing?.noted);
  const read = detail?.key === detailKey ? detail.value : undefined;
  const photoId = noted ? null : read === undefined ? (thing?.photoId ?? null) : read ? read.photoId : (thing?.photoId ?? null);
  const box = read?.box ?? null;
  const worthOn = useOption("worthLook");
  const cardMarkers = read ? cardPhotoMarkers(read.cardThings ?? [], worthOn) : [];
  const viewing = photoView !== null && photoId !== null && cardMarkers.length > 0;
  const isCounted = counted !== null;
  const dirty = cleanThingName(nameDraft) !== name || (!isCounted && countDraft !== "");

  function go(next: Step) {
    setNotice(null);
    setFieldError(null);
    if (next === "category") setChoice(category);
    setStep(next);
  }

  /** Saves the name and the category with `patch` on top, and says whether it went (it came back to the first view then). */
  async function save(patch: { name?: string; category?: ThingCategory }): Promise<boolean> {
    if (!thing || saving) return false;
    setNotice(null);
    const nextName = cleanThingName(patch.name ?? name);
    const nextCategory = patch.category ?? category;
    if (nextName === "") {
      setFieldError(emptyNameText);
      nameRef.current?.focus();
      return false;
    }
    if (nextName === name && nextCategory === category) {
      setStep("main");
      return true;
    }
    setSaving(true);
    let result: Result<null>;
    try {
      // The AI's "where" is left as it is: it is not given.
      result = await updateThing({ id: thing.id, name: nextName, category: nextCategory });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setName(nextName);
      setNameDraft(nextName);
      setCategory(nextCategory);
      onEvent?.({ kind: "saved", id: thing.id, name: nextName, category: nextCategory, whereHint: thing.whereHint });
      setStep("main");
      router.refresh();
      return true;
    }
    if (result.error.code === "things_item_gone" || result.error.code === "unauthorized") router.refresh();
    if (result.error.fields?.name) {
      setFieldError(result.error.fields.name);
      nameRef.current?.focus();
      return false;
    }
    setNotice(result.error.message);
    setStep("main");
    return false;
  }

  /** "Spara": the name, and the count when one is typed in; the sheet closes, as it does for a picked category. */
  async function saveAll() {
    if (!thing || saving || !dirty) return;
    let quantity: number | null = null;
    if (!isCounted && countDraft !== "") {
      quantity = Number(countDraft);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > maxCount) {
        setCountError(countInvalidText);
        return;
      }
    }
    setCountError(null);
    if (!(await save({ name: nameDraft }))) return;
    if (quantity !== null) {
      setSaving(true);
      let result: Awaited<ReturnType<typeof setThingCount>>;
      try {
        result = await setThingCount({ itemId: thing.id, quantity });
      } catch {
        result = fail("things_count_failed");
      }
      setSaving(false);
      if (!result.ok) {
        setNotice(result.error.message);
        return;
      }
      onEvent?.({ kind: "counted", id: thing.id, quantity });
      router.refresh();
    }
    onClose();
  }

  async function remove() {
    if (!thing || saving) return;
    const removed = thing;
    setSaving(true);
    let result: Awaited<ReturnType<typeof removeThing>>;
    try {
      result = await removeThing(removed.id);
    } catch {
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (!result.ok) {
      if (result.error.code === "things_item_gone") router.refresh();
      setNotice(result.error.message);
      return;
    }
    const snapshot = result.data;
    onEvent?.({ kind: "removed", id: removed.id });
    onClose();
    router.refresh();
    const undo = () => {
      void (async () => {
        let restored: Result<null>;
        try {
          restored = await restoreThing(snapshot);
        } catch {
          restored = fail("things_restore_failed");
        }
        if (restored.ok) onEvent?.({ kind: "restored", id: removed.id });
        else showToast(restored.error.message, { role: "alert" });
        router.refresh();
      })();
    };
    // UX-B: a room's list keeps the row, struck through, with "Ångra"; where no list does, the toast is the one "Ångra".
    if (hasRemovedThingsHost()) {
      addRemovedThing({ id: removed.id, name: removed.name, photoId: snapshot.photoId, category: snapshot.category, noted: snapshot.source === "noted", undo });
    } else {
      showToast(removedThingText(removed.name), { onUndo: undo });
    }
  }

  const crumbs = read && !noted ? thingCrumbs(read.place) : [];
  const saveButton = (
    <Button variant="compact-primary" onClick={() => void saveAll()} aria-disabled={saving || undefined} data-testid="thing-save">
      {saving ? "Sparar …" : saveNameText}
    </Button>
  );

  return (
    <>
    <Sheet
      open={open && !viewing}
      onClose={onClose}
      title={step === "main" ? thingSheetTitleText : categoryLabelText}
      subtitle={thing && step === "main" ? (subtitle ?? defaultSubtitle(thing)) : undefined}
      onBack={step === "main" ? undefined : () => setStep("main")}
      closeLabel="Avbryt"
      preventClose={saving}
    >
      {step === "category" ? (
        <div ref={categoriesRef}>
          <ChoiceRows<ThingCategory>
            label={categoryLabelText}
            options={thingCategories.map((value) => ({ value, label: value, icon: thingTiles[value].icon, testId: "thing-category-option" }))}
            value={choice}
            onChange={setChoice}
            onPick={(value) =>
              // A new category moves the föremål to another group of its list, which closes the sheet there, so it closes here at once.
              void save({ category: value }).then((saved) => {
                if (saved) onClose();
              })
            }
          />
        </div>
      ) : null}
      {/* The first view stays mounted, hidden, in a step, so the count is not read again. */}
      <div hidden={step !== "main"} aria-busy={saving || undefined} className="flex flex-col gap-4">
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {photoId ? (
          <ThingPhoto
            key={photoId}
            photoId={photoId}
            thingId={thing?.id ?? ""}
            box={box}
            canView={cardMarkers.length > 0}
            onView={(zoomed) => setPhotoView((current) => ({ zoomed, opened: (current?.opened ?? 0) + 1 }))}
            onOpen={onClose}
          />
        ) : (
          // No photo (written or noted, or not read yet): the category's emoji on a mint tile.
          <div className="flex h-32 items-center justify-center rounded-lg bg-mint text-5xl" aria-hidden="true" data-testid="thing-tile">
            {thingTiles[category].icon}
          </div>
        )}
        {crumbs.length > 0 ? (
          <nav aria-label={placeCrumbsLabel} className="-mt-1 flex flex-wrap items-center gap-x-1 px-1 text-body text-ink-2" data-testid="thing-crumbs">
            {crumbs.map((crumb, index) => (
              <Fragment key={crumb.label}>
                {index > 0 ? (
                  <span aria-hidden="true" className="text-ink-3">
                    ›
                  </span>
                ) : null}
                {crumb.href ? (
                  <Link href={crumb.href} onClick={onClose} className="inline-flex min-h-tap items-center font-medium text-accent">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        ) : null}
        {/* The name is a free field: no register, no suggestions, and the title above does not change with it. */}
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${ids}-name`}>{nameFieldText}</FieldLabel>
          <Input
            ref={nameRef}
            id={`${ids}-name`}
            name="name"
            autoComplete="off"
            maxLength={maxThingNameChars * 2}
            value={nameDraft}
            onChange={(event) => {
              setNameDraft(event.target.value);
              setFieldError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveAll();
              }
            }}
            aria-invalid={fieldError && step === "main" ? true : undefined}
            aria-describedby={fieldError && step === "main" ? `${ids}-name-error` : undefined}
          />
          {fieldError && step === "main" ? <FieldError id={`${ids}-name-error`}>{fieldError}</FieldError> : null}
        </div>
        {read ? <WorthBlock key={`worth-${thing?.id ?? ""}-${sessionAt}`} worth={read.worth} state={read.worthState} thingId={thing?.id} name={thing?.name} canExamine={photoId !== null} /> : null}
        {/* Story 18.23: the count; not counted is a field to write it in, with the one small Spara beside it, shown when something is changed. */}
        {thing ? (
          <CountCard
            key={`count-${thing.id}-${sessionAt}`}
            itemId={thing.id}
            name={thing.name}
            initial={thing.quantity ?? null}
            onQuantity={(quantity) => {
              setCounted(quantity);
              onEvent?.({ kind: "counted", id: thing.id, quantity });
            }}
            draft={countDraft}
            onDraft={(value) => {
              setCountDraft(value);
              setCountError(null);
            }}
            draftError={countError}
            onSubmit={() => void saveAll()}
            action={dirty ? saveButton : null}
          />
        ) : null}
        {isCounted && dirty ? <div className="-mt-2 flex justify-end">{saveButton}</div> : null}
        {link ? (
          <Link
            href={link.href}
            onClick={onClose}
            className="-mt-1 flex min-h-tap items-center justify-between gap-3 rounded-lg bg-bg py-2 pr-3 pl-4 text-body font-medium text-ink"
            data-testid="thing-sheet-link"
          >
            {link.label}
            <ChevronRightIcon size={16} className="shrink-0 text-ink-3" />
          </Link>
        ) : null}
        {/* Two quiet lines (Pontus 20 Nov): small, muted text, nothing like buttons. */}
        <div className="flex items-center justify-between gap-3">
          <button
            ref={categoryRowRef}
            type="button"
            onClick={() => go("category")}
            aria-label={`${categoryLabelText}, ${category}`}
            data-testid="thing-category"
            className="inline-flex min-h-tap items-center gap-1 rounded-md pr-1 text-meta text-ink-2"
          >
            <span aria-hidden="true">
              {categoryLabelText}: {thingTiles[category].icon} {category}
            </span>
            <ChevronRightIcon size={12} className="shrink-0 text-ink-3" />
          </button>
          <button type="button" onClick={() => void remove()} data-testid="thing-remove" className="inline-flex min-h-tap items-center rounded-md pl-1 text-meta text-danger">
            {removeThingText}
          </button>
        </div>
      </div>
    </Sheet>
    {viewing && photoId ? (
      <PhotoViewer
        key={photoView.opened}
        open={open}
        onClose={() => setPhotoView(null)}
        photo={{ url: `/api/things/photo/${photoId}`, size: null }}
        title={photoViewerTitleText}
        noun="Föremål"
        markers={cardMarkers}
        quietMarkers
        initialNumber={photoView.zoomed && thing && read ? numberOnCard(read.cardThings ?? [], thing.id) : null}
        alt={photoViewerAltText}
      >
        <Link href={cardViewHref(photoId, thing?.id ?? "")} onClick={onClose} data-testid="thing-photo-card-page" className="inline-flex min-h-tap w-fit items-center rounded-md px-2 text-[0.9375rem] font-medium text-accent">
          {openCardPageText}
        </Link>
      </PhotoViewer>
    ) : null}
    </>
  );
}
