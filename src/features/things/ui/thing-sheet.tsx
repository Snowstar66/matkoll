"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FilterPills } from "@/components/filter-pills";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { ChevronRightIcon } from "@/components/icons";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { fail, type Result } from "@/lib/errors";
import { removeThing, restoreThing, updateThing } from "../actions/thing-item";
import { thingCategories, thingMeta, thingTiles, type Thing, type ThingCategory } from "../domain/thing";
import {
  categoryLabelText,
  cleanThingName,
  emptyNameText,
  maxThingNameChars,
  maxWhereChars,
  removedThingText,
  removeThingText,
  renameThingText,
  wherePlaceholderText,
  whereLabelText,
} from "../domain/thing-edit";
import { thingNounCap } from "../domain/thing-noun";
import { notedSheetSubtitle } from "../domain/thing-noted";
import { CountCard } from "./count-card";

// Föremålets blad (Stories 18.3, 18.15 and 18.23; Pontus 1 Nov): one sheet for
// a föremål wherever it is tapped, in a room's list, a search hit or on its
// card. First the count card (Ta, Fyll på, Räkna, saved at once), then "Visa
// på kortet ›" when the sheet was opened away from the card, the name, the
// category and where on the picture (Spara), and last "Ta bort föremålet" in
// the muted red, which goes at once with "Tog bort X." and Ångra (the count and
// its history come back too).

/** What the sheet needs of a föremål. */
export type SheetThing = Pick<Thing, "id" | "name" | "category" | "whereHint" | "confidence"> & Pick<Partial<Thing>, "seenOn" | "noted" | "quantity">;

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

export function ThingSheet({ thing, open, onClose, subtitle, link, onEvent }: ThingSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ThingCategory>("Övrigt");
  const [where, setWhere] = useState("");
  const [whereError, setWhereError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Each opening starts from the föremål as it is now, with its count read again.
  const [session, setSession] = useState<{ id: string; at: number } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  if (open && thing && session?.id !== thing.id) {
    setSession({ id: thing.id, at: (session?.at ?? 0) + 1 });
    setName(thing.name);
    setCategory(thing.category);
    // A noted thing (Story 18.19) has no picture: its hint is where it is and when, never a "where on the picture".
    setWhere(thing.noted ? "" : (thing.whereHint ?? ""));
    setWhereError(null);
    setError(null);
    setNotice(null);
  }
  if (!open && session !== null && session.id !== "") setSession({ id: "", at: session.at });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thing || saving) return;
    setNotice(null);
    const cleaned = cleanThingName(name);
    if (cleaned === "") {
      setError(emptyNameText);
      nameRef.current?.focus();
      return;
    }
    const noted = Boolean(thing.noted);
    const cleanedWhere = noted ? null : cleanThingName(where) || null;
    if (cleaned === thing.name && category === thing.category && cleanedWhere === (noted ? null : thing.whereHint)) {
      onClose();
      return;
    }
    setSaving(true);
    let result: Result<null>;
    try {
      result = await updateThing({ id: thing.id, name, category, whereHint: noted ? null : where });
    } catch {
      // No answer (e.g. no connection): it may have been saved, so the page is read again.
      result = fail("things_item_failed");
      router.refresh();
    }
    setSaving(false);
    if (result.ok) {
      onEvent?.({ kind: "saved", id: thing.id, name: cleaned, category, whereHint: noted ? thing.whereHint : cleanedWhere });
      onClose();
      router.refresh();
      return;
    }
    if (result.error.code === "things_item_gone" || result.error.code === "unauthorized") router.refresh();
    if (result.error.fields?.name) {
      setError(result.error.fields.name);
      nameRef.current?.focus();
      return;
    }
    if (result.error.fields?.where) {
      setWhereError(result.error.fields.where);
      return;
    }
    setNotice(result.error.message);
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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={thing?.name ?? thingNounCap.singular}
      subtitle={thing ? (subtitle ?? defaultSubtitle(thing)) : undefined}
      closeLabel="Avbryt"
      preventClose={saving}
    >
      <form onSubmit={save} noValidate aria-busy={saving || undefined} className="flex flex-col gap-4">
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {/* Story 18.23: the count first, saved at once (no Spara); read again each time the sheet opens. */}
        {thing ? (
          <CountCard
            key={`${thing.id}-${session?.at ?? 0}`}
            itemId={thing.id}
            name={thing.name}
            initial={thing.quantity ?? null}
            onQuantity={(quantity) => onEvent?.({ kind: "counted", id: thing.id, quantity })}
          />
        ) : null}
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
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${ids}-name`}>{renameThingText}</FieldLabel>
          <Input
            ref={nameRef}
            id={`${ids}-name`}
            name="name"
            autoComplete="off"
            maxLength={maxThingNameChars * 2}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${ids}-name-error` : undefined}
          />
          {error ? <FieldError id={`${ids}-name-error`}>{error}</FieldError> : null}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-body font-medium text-ink">{categoryLabelText}</p>
          <FilterPills<ThingCategory>
            label={categoryLabelText}
            value={category}
            onChange={setCategory}
            options={thingCategories.map((value) => ({ value, label: value, icon: thingTiles[value].icon }))}
            className="[&>button]:min-h-tap"
          />
        </div>
        {/* A noted thing (Story 18.19) has no picture to say where on. */}
        {thing?.noted ? null : (
          <div className="flex flex-col gap-2">
            <FieldLabel htmlFor={`${ids}-where`} optional>
              {whereLabelText}
            </FieldLabel>
            <Input
              id={`${ids}-where`}
              name="where"
              autoComplete="off"
              maxLength={maxWhereChars * 2}
              placeholder={wherePlaceholderText}
              value={where}
              onChange={(event) => {
                setWhere(event.target.value);
                setWhereError(null);
              }}
              aria-invalid={whereError ? true : undefined}
              aria-describedby={whereError ? `${ids}-where-error` : undefined}
            />
            {whereError ? <FieldError id={`${ids}-where-error`}>{whereError}</FieldError> : null}
          </div>
        )}
        <Button type="submit" fullWidth aria-disabled={saving || undefined}>
          {saving ? "Sparar …" : "Spara"}
        </Button>
        <Button variant="danger" fullWidth disabled={saving} onClick={remove} data-testid="thing-remove">
          {removeThingText}
        </Button>
      </form>
    </Sheet>
  );
}
