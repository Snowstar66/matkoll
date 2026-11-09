"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, Fragment, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { ChoiceRows } from "@/components/choice-rows";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { ListGroup } from "@/components/list-group";
import { ListRow } from "@/components/list-row";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { loadThingDetail } from "../actions/thing-detail";
import { removeThing, restoreThing, updateThing } from "../actions/thing-item";
import { cardViewHref } from "../domain/thing-card";
import { thingCrumbs, type ThingDetail } from "../domain/thing-detail";
import { thingCategories, thingMeta, thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import {
  categoryLabelText,
  cleanThingName,
  emptyNameText,
  maxThingNameChars,
  maxWhereChars,
  nameFieldText,
  openWholeCardText,
  placeCrumbsLabel,
  saveNameText,
  removedThingText,
  removeThingText,
  renameThingText,
  wherePlaceholderText,
  whereLabelText,
} from "../domain/thing-edit";
import { thingNounCap } from "../domain/thing-noun";
import { notedSheetSubtitle } from "../domain/thing-noted";
import { CountCard } from "./count-card";

// Föremålets blad (Stories 18.3, 18.15 and 18.23; Pontus 1 and 9 Nov): one sheet
// for a föremål wherever it is tapped, in a room's list, a search hit or on its
// card. From the top: the card's photo with the föremål's box marked (a tap
// opens the whole card; a tile with the category's emoji when there is no
// photo), where it is kept as crumbs, the count card (Ta, Fyll på, Räkna, saved
// at once), and one card of calm rows: "Byt namn ›", "Kategori  🛍️ Övrigt ›",
// "Var på bilden ›" (only with a photo) and last "Ta bort föremålet" in the
// muted red, which goes at once with "Tog bort X." and Ångra. Each row opens its
// own step in the same sheet ("‹ Tillbaka"); a step saves at once and comes back,
// so the first view has no Spara (a picked category closes the sheet: the föremål moves to another group of its list). The photo and the place are read when the
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
  if (thing.noted) return notedSheetSubtitle(thing.noted.part, new Date(thing.noted.at));
  return thingMeta(thing) || undefined;
}

type Step = "main" | "rename" | "where" | "category";

const stepTitles: Record<Exclude<Step, "main">, string> = { rename: renameThingText, where: whereLabelText, category: categoryLabelText };

/** The photo of the card with the föremål's box framed and the rest shaded; the box is a share of the photo, so the overlay sits right at any size. */
function ThingPhoto({ photoId, thingId, box, onOpen }: { photoId: string; thingId: string; box: ThingDetail["box"]; onOpen: () => void }) {
  return (
    <div className="flex justify-center">
      <Link
        href={cardViewHref(photoId, thingId)}
        onClick={onOpen}
        aria-label={openWholeCardText}
        className="relative inline-block max-w-full overflow-hidden rounded-lg bg-border"
        data-testid="thing-photo"
      >
        {/* The photo is served by the route that checks the user; nothing is fetched from anywhere else. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/things/photo/${photoId}`} alt="" className="block max-h-[40svh] w-auto max-w-full" draggable={false} />
        {box ? (
          <span
            aria-hidden="true"
            data-testid="thing-photo-box"
            className="pointer-events-none absolute rounded-md border-2 border-white"
            style={{
              left: `${box.left * 100}%`,
              top: `${box.top * 100}%`,
              width: `${box.width * 100}%`,
              height: `${box.height * 100}%`,
              boxShadow: "0 0 0 100vmax color-mix(in srgb, var(--ink) 45%, transparent)",
            }}
          />
        ) : null}
      </Link>
    </div>
  );
}

/** A row of the sheet's card: the name on the left, the value and › on the right. */
function SheetRow({ label, value, ariaLabel, onPress, rowRef, testId }: { label: string; value?: string; ariaLabel?: string; onPress: () => void; rowRef: (el: HTMLElement | null) => void; testId?: string }) {
  return (
    <ListRow
      plain
      pressRef={rowRef}
      onPress={onPress}
      pressProps={{ ...(ariaLabel ? { "aria-label": ariaLabel } : {}), ...(testId ? { "data-testid": testId } : {}) }}
      title={
        <span className="flex items-center justify-between gap-3">
          <span className="shrink-0">{label}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
            {value ? <span className="truncate">{value}</span> : null}
            <ChevronRightIcon size={16} className="shrink-0 text-ink-3" />
          </span>
        </span>
      }
    />
  );
}

export function ThingSheet({ thing, open, onClose, subtitle, link, onEvent }: ThingSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  // What the föremål is now: from the opener, then as saved in the sheet.
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ThingCategory>("Övrigt");
  const [where, setWhere] = useState("");
  // The text in the open step's field.
  const [draft, setDraft] = useState("");
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
  const fieldRef = useRef<HTMLInputElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Partial<Record<Exclude<Step, "main">, HTMLElement | null>>>({});
  const lastStep = useRef<Step>("main");
  const ids = useId();
  const thingId = thing?.id ?? null;
  const sessionAt = session?.at ?? 0;
  const detailKey = `${thingId}-${sessionAt}`;

  // Focus follows the step: the chosen category or the field going deeper, the row that opened the step when coming back.
  useEffect(() => {
    if (step === "category") categoriesRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    else if (step !== "main") fieldRef.current?.focus();
    else if (lastStep.current !== "main") rowRefs.current[lastStep.current]?.focus();
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
    setCategory(thing.category);
    // A noted thing (Story 18.19) has no picture: its hint is where it is and when, never a "where on the picture".
    setWhere(thing.noted ? "" : (thing.whereHint ?? ""));
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
  // "Var på bilden" is for a föremål on a card; until the detail is read, every föremål that is not noted is taken to be one.
  const hasPhoto = !noted && (read === undefined ? true : read ? read.photoId !== null : true);

  function go(next: Step) {
    setNotice(null);
    setFieldError(null);
    if (next === "rename") setDraft(name);
    if (next === "where") setDraft(where);
    if (next === "category") setChoice(category);
    setStep(next);
  }

  /** Saves the three fields with `patch` on top, and says whether it went (it came back to the first view then). */
  async function save(patch: { name?: string; category?: ThingCategory; where?: string }): Promise<boolean> {
    if (!thing || saving) return false;
    setNotice(null);
    const nextName = cleanThingName(patch.name ?? name);
    const nextCategory = patch.category ?? category;
    const nextWhere = noted ? null : cleanThingName(patch.where ?? where) || null;
    if (nextName === "") {
      setFieldError(emptyNameText);
      fieldRef.current?.focus();
      return false;
    }
    if (nextName === name && nextCategory === category && nextWhere === (noted ? null : where || null)) {
      setStep("main");
      return true;
    }
    setSaving(true);
    let result: Result<null>;
    try {
      result = await updateThing({ id: thing.id, name: nextName, category: nextCategory, whereHint: nextWhere });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      setName(nextName);
      setCategory(nextCategory);
      if (!noted) setWhere(nextWhere ?? "");
      onEvent?.({ kind: "saved", id: thing.id, name: nextName, category: nextCategory, whereHint: noted ? thing.whereHint : nextWhere });
      setStep("main");
      router.refresh();
      return true;
    }
    if (result.error.code === "things_item_gone" || result.error.code === "unauthorized") router.refresh();
    if (result.error.fields?.name || result.error.fields?.where) {
      setFieldError(result.error.fields.name ?? result.error.fields.where ?? null);
      fieldRef.current?.focus();
      return false;
    }
    setNotice(result.error.message);
    setStep("main");
    return false;
  }

  function submitStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "rename") void save({ name: draft });
    else if (step === "where") void save({ where: draft });
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
    showToast(removedThingText(removed.name), {
      onUndo: () => {
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
      },
    });
  }

  const crumbs = read && !noted ? thingCrumbs(read.place) : [];
  const stepLabel = step === "where" ? whereLabelText : nameFieldText;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={step === "main" ? (thing ? name || thing.name : thingNounCap.singular) : stepTitles[step]}
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
      {step === "rename" || step === "where" ? (
        <form onSubmit={submitStep} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-field`} optional={step === "where"}>
              {stepLabel}
            </FieldLabel>
            <Input
              ref={fieldRef}
              id={`${ids}-field`}
              name={step}
              autoComplete="off"
              maxLength={(step === "rename" ? maxThingNameChars : maxWhereChars) * 2}
              placeholder={step === "where" ? wherePlaceholderText : undefined}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFieldError(null);
              }}
              aria-invalid={fieldError ? true : undefined}
              aria-describedby={fieldError ? `${ids}-field-error` : undefined}
            />
            {fieldError ? <FieldError id={`${ids}-field-error`}>{fieldError}</FieldError> : null}
          </div>
          <Button type="submit" fullWidth aria-disabled={saving || undefined}>
            {saving ? "Sparar …" : saveNameText}
          </Button>
        </form>
      ) : null}
      {/* The first view stays mounted, hidden, in a step, so the count is not read again. */}
      <div hidden={step !== "main"} aria-busy={saving || undefined} className="flex flex-col gap-4">
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {photoId ? (
          <ThingPhoto key={photoId} photoId={photoId} thingId={thing?.id ?? ""} box={box} onOpen={onClose} />
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
        {/* Story 18.23: the count first, saved at once (no Spara); read again each time the sheet opens. */}
        {thing ? (
          <CountCard
            key={`${thing.id}-${sessionAt}`}
            itemId={thing.id}
            name={thing.name}
            initial={thing.quantity ?? null}
            onQuantity={(quantity) => onEvent?.({ kind: "counted", id: thing.id, quantity })}
          />
        ) : null}
        {link && !photoId ? (
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
        <ListGroup label="Ändra" className="border border-border">
          <SheetRow label={renameThingText} onPress={() => go("rename")} rowRef={(el) => void (rowRefs.current.rename = el)} testId="thing-rename" />
          <SheetRow
            label={categoryLabelText}
            value={`${thingTiles[category].icon} ${category}`}
            ariaLabel={`${categoryLabelText}, ${category}`}
            onPress={() => go("category")}
            rowRef={(el) => void (rowRefs.current.category = el)}
            testId="thing-category"
          />
          {hasPhoto ? (
            <SheetRow label={whereLabelText} value={where || undefined} onPress={() => go("where")} rowRef={(el) => void (rowRefs.current.where = el)} testId="thing-where" />
          ) : null}
          <ListRow
            plain
            onPress={() => void remove()}
            pressProps={{ "data-testid": "thing-remove" }}
            title={<span className="text-danger">{removeThingText}</span>}
          />
        </ListGroup>
      </div>
    </Sheet>
  );
}
