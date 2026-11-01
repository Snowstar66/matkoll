"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { CheckIcon, TrashIcon } from "@/components/icons";
import { AmountInput } from "@/components/amount-input";
import { FieldError, FieldLabel, Input } from "@/components/field";
import {
  type IngredientHit,
  type SearchIngredients,
  useIngredientSearch,
} from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { searchDelayMs } from "@/components/search-field";
import { Sheet } from "@/components/sheet";
import { UnitChoice, UnitList } from "@/components/unit-choice";
import { useToast } from "@/components/toast";
import { isCountUnit, UNITS, type Unit } from "@/features/catalog";
import { stepAmountField } from "@/features/pantry";
import { fail, type Result } from "@/lib/errors";
import { addCustomItem } from "../actions/add-custom-item";
import { updateCustomItem } from "../actions/update-custom-item";
import {
  customItemFieldErrors,
  customItemFormSchema,
  exactAmountText,
  maxCustomAmountChars,
  maxCustomLabelLength,
  type CustomItemFormInput,
  type CustomItemRow,
} from "../domain/custom-item";

// Lägg till vara (FR-17, Story 3.5): the sheet that adds Pontus's own
// item to the list. They write what they want; while they type (after the
// Sökfält pause, 200 ms) the catalog suggests ingredients, and choosing one
// links the item to it, so it goes under that ingredient's section, else
// under Övrigt. Amount and unit are optional, both or neither. Nothing is
// ever written to the catalog from here: only the link is stored. After
// "Lägg till" the sheet stays open with an empty field for the next item and
// "Klar" to stop (iOS Reminders, fix after go-live). The same
// sheet is an own item's Listpostdetalj (Story 3.6), where "Spara" changes the
// item and "Ta bort" removes it.

/** How many suggestions show under the field. */
export const maxSuggestions = 5;

/** The title of the sheet that adds an item; the list's field and header "+" have the same name. */
export const addSheetTitle = "Lägg till vara";

/** The confirmation in the sheet after an item was added, while it waits for the next. */
export function addedText(label: string): string {
  return `La till ${label.trim()}.`;
}

/** Under the field when the catalog could not be searched; the item can still be added. */
export const suggestionsUnavailableText = "Förslag går inte att visa just nu.";

type FormValues = {
  label: string;
  /** The catalog ingredient chosen among the suggestions, or `null`. */
  link: IngredientHit | null;
  /** As typed; empty for none. */
  amount: string;
  unit: Unit | "";
};

const emptyValues: FormValues = { label: "", link: null, amount: "", unit: "" };

/** "Kopplad till okänd ingrediens": a link whose catalog name could not be read. */
export const unknownIngredientName = "okänd ingrediens";

/** An own item as its detail opens it: the line's text, link, amount and unit. */
export type CustomItemSheetItem = {
  id: string;
  label: string;
  ingredientId: string | null;
  /** The catalog ingredient's name, for "Kopplad till Kaffe"; `null` when it is not known. */
  linkedName: string | null;
  amount: number | null;
  unit: Unit | null;
};

/** The form for `item`, or empty for a new item. */
function valuesOf(item: CustomItemSheetItem | undefined): FormValues {
  if (!item) return emptyValues;
  return {
    label: item.label,
    link: item.ingredientId ? { id: item.ingredientId, name: item.linkedName ?? unknownIngredientName } : null,
    // The exact amount, not formatQuantity's rounding, so an unchanged amount saves as it was.
    amount: exactAmountText(item.amount),
    unit: item.unit ?? "",
  };
}

/** Unsaved changes: a new item with anything typed, or an item with any field changed. */
function isFormDirty(values: FormValues, initial: FormValues): boolean {
  if (initial === emptyValues) {
    return values.label.trim() !== "" || values.link !== null || values.amount.trim() !== "" || values.unit !== "";
  }
  return (
    values.label !== initial.label ||
    (values.link?.id ?? null) !== (initial.link?.id ?? null) ||
    values.amount !== initial.amount ||
    values.unit !== initial.unit
  );
}

export type CustomItemSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Searches the catalog for suggestions (catalog.searchIngredients, passed down from the page, AD-1). */
  searchIngredients: SearchIngredients;
  /**
   * Increases each time the sheet opens: the form then starts empty, with a
   * new id for the item, or from `item`. (The sheet stays mounted; see PantryItemSheet.)
   */
  session: number;
  /** An own item to change (its Listpostdetalj, Story 3.6); without it, the sheet adds a new item. */
  item?: CustomItemSheetItem;
  /** The title for an item to change: its text as the line showed it. */
  title?: string;
  /** "Ta bort" in an item's detail: removes it, with "Ångra" (Story 3.5). */
  onRemove?: () => void;
  /**
   * Under the form in an item's detail: the section Produktval (Story 7.2),
   * given whether the form is saving and whether it has unsaved changes.
   */
  renderAfterForm?: (saving: boolean, dirty: boolean) => ReactNode;
};

/**
 * Arket Lägg till vara: the text field (16 px, in focus from the start)
 * with the catalog's suggestions under it, then Mängd and Enhet. A chosen
 * suggestion puts its name in the field and shows "Kopplad till Kaffe" with
 * "Ta bort kopplingen"; the text can still be changed, and the link stays.
 * Only the link is stored: nothing is written to the catalog. "Lägg till"
 * saves with addCustomItem; the list behind is read again, and the sheet
 * stays open with the form empty and focus in the field, says "La till
 * diskmedel." and offers "Klar" instead of "Avbryt". The item's id is kept while the form is unchanged, so trying again
 * after a lost answer adds it once; a change to any field makes a new one,
 * so a changed item is never sent with an id already used. Unsaved text asks
 * "Släng ändringarna?" before the sheet closes.
 */
export function CustomItemSheet({
  open,
  onClose,
  searchIngredients,
  session,
  item,
  title,
  onRemove,
  renderAfterForm,
}: CustomItemSheetProps) {
  const router = useRouter();
  const [formSession, setFormSession] = useState(session);
  const [initial, setInitial] = useState(() => valuesOf(item));
  const [values, setValues] = useState(initial);
  const [itemId, setItemId] = useState<string | null>(null);
  /** Why saving failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The server's messages by field, shown at the field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The form's own errors show after a save attempt, not while typing. */
  const [attempted, setAttempted] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  /** "Ta bort" has been pressed in this opening: a second press does nothing. */
  const removing = useRef(false);
  const { showToast } = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  /** Story 19.5: "Fler ›" is a step in, replacing the form with all the units. */
  const [unitStep, setUnitStep] = useState(false);
  const unitRef = useRef<HTMLDivElement>(null);
  const nextError = useRef(0);
  /** The last item added in this opening, for "La till diskmedel." and "Klar"; a new id each time. */
  const [added, setAdded] = useState<{ label: string; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { query, hits, error: searchError, search, reset: resetSearch } = useIngredientSearch(searchIngredients);
  const ids = useId();

  // A new session: the form starts empty, or from the item (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = valuesOf(item);
    setFormSession(session);
    setUnitStep(false);
    setInitial(fresh);
    setValues(fresh);
    setItemId(null);
    setError(null);
    setServerFields({});
    setAttempted(false);
    setAdded(null);
    // The last opening's suggestions are not this one's.
    resetSearch();
  }

  useEffect(() => () => clearTimeout(timer.current), []);
  // A search the last opening was waiting for never runs in this one.
  useEffect(() => () => clearTimeout(timer.current), [session]);

  // The text field has focus from the start for a new item. After the commit:
  // the sheet's showModal moves focus to its first control (see IngredientPicker).
  const editing = item !== undefined;
  useEffect(() => {
    if (!open || editing) return;
    let active = true;
    queueMicrotask(() => {
      if (active) labelRef.current?.focus();
    });
    return () => {
      active = false;
    };
  }, [open, session, editing]);

  useEffect(() => {
    if (open) removing.current = false;
  }, [open, session]);

  /** An item was just added: focus goes back to the field once the form is no longer inert. */
  const focusNext = useRef(false);

  const [, save, saving] = useActionState(async (_previous: null, { input, change }: { input: CustomItemFormInput; change: boolean }) => {
    let result: Result<CustomItemRow>;
    try {
      result = await (change ? updateCustomItem(input) : addCustomItem(input));
    } catch {
      // No answer (e.g. no connection): the form stays, with the same id for the next try.
      result = fail("shopping_save_failed");
    }
    if (result.ok) {
      // The action revalidated the list, so the list behind shows the item as saved.
      if (change) {
        onClose();
        return null;
      }
      // A new item: the form starts over for the next one, and the sheet stays open.
      clearTimeout(timer.current);
      resetSearch();
      setInitial(emptyValues);
      setValues(emptyValues);
      setItemId(null);
      setAttempted(false);
      setUnitStep(false);
      setAdded((before) => ({ label: input.label, id: (before?.id ?? 0) + 1 }));
      focusNext.current = true;
      return null;
    }
    const { code, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return null;
    }
    if (code === "shopping_item_gone") {
      // Removed elsewhere: there is nothing to change any more.
      onClose();
      router.refresh();
      showToast(result.error.message);
      return null;
    }
    if (fields && Object.keys(fields).length > 0) {
      setServerFields(fields);
      return null;
    }
    nextError.current += 1;
    setError({ text: result.error.message, id: nextError.current });
    if (code === "shopping_plan_changed") router.refresh();
    return null;
  }, null);

  // After an item was added, the field is ready for the next, once saving is over (the form is inert until then).
  useEffect(() => {
    if (saving || !focusNext.current) return;
    focusNext.current = false;
    labelRef.current?.focus();
  }, [saving, added]);

  const input: CustomItemFormInput = {
    ...(itemId ? { id: itemId } : {}),
    label: values.label,
    ingredientId: values.link?.id ?? null,
    amount: values.amount,
    unit: values.unit,
  };
  const parsed = customItemFormSchema.safeParse(input);
  const ownErrors = attempted && !parsed.success ? customItemFieldErrors(parsed.error) : {};
  const fieldError = (field: "label" | "amount" | "unit") => serverFields[field] ?? ownErrors[field] ?? null;
  const labelError = fieldError("label");
  const amountError = fieldError("amount");
  const unitError = fieldError("unit");
  /** A refusal without a field to point at (e.g. a plan id that is not one). */
  const formError =
    attempted && !parsed.success && Object.keys(customItemFieldErrors(parsed.error)).length === 0
      ? fail("validation").error.message
      : null;

  /**
   * A change to any field: the last save's errors no longer apply, and the
   * next save of a new item has a new id (AD-20).
   */
  const update = (changes: Partial<FormValues>) => {
    setError(null);
    setServerFields({});
    setItemId(null);
    setValues((current) => ({ ...current, ...changes }));
  };

  function changeLabel(label: string) {
    update({ label });
    // A linked item keeps its link while the text changes; suggestions are for an item without one.
    if (values.link) return;
    clearTimeout(timer.current);
    if (!label.trim()) {
      void search("");
      return;
    }
    timer.current = setTimeout(() => void search(label), searchDelayMs);
  }

  function choose(hit: IngredientHit) {
    clearTimeout(timer.current);
    update({ label: hit.name, link: { id: hit.id, name: hit.name } });
    labelRef.current?.focus();
  }

  function unlink() {
    update({ link: null });
    void search(values.label);
    labelRef.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!parsed.success) {
      // Nothing is saved; the reasons show at their fields, and focus goes to the first.
      setAttempted(true);
      const fields = customItemFieldErrors(parsed.error);
      if (fields.label) labelRef.current?.focus();
      else if (fields.amount) amountRef.current?.focus();
      else if (fields.unit) unitRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus();
      return;
    }
    setError(null);
    if (item) {
      // Unchanged: nothing to save. Saving the same again changes nothing, so a retry is safe.
      if (!isFormDirty(values, initial)) {
        onClose();
        return;
      }
      const payload = { input: { ...input, id: item.id }, change: true };
      startTransition(() => save(payload));
      return;
    }
    // One id per opening: a retry after a lost answer adds the item once (AD-20).
    const id = itemId ?? crypto.randomUUID();
    if (!itemId) setItemId(id);
    const payload = { input: { ...input, id }, change: false };
    startTransition(() => save(payload));
  }

  /** "Ta bort": no question first, even with unsaved changes; the confirmation offers "Ångra" (Story 3.5). */
  function remove() {
    if (saving || !onRemove || removing.current) return;
    removing.current = true;
    onClose();
    onRemove();
  }

  // The latest answer stays while Pontus types on, until the next one comes.
  const searching = !values.link && query.trim() !== "" && values.label.trim() !== "";
  const suggestions = searching && hits ? hits.slice(0, maxSuggestions) : [];
  const suggestionsFailed = searching && searchError !== null;
  const formId = `${ids}-form`;
  const describedBy = (field: string, message: string | null) =>
    message ? { "aria-invalid": true as const, "aria-describedby": `${ids}-${field}-error` } : {};

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        unitStep
          ? "Enhet"
          : item
            ? (title ?? item.label)
            : addSheetTitle
      }
      onBack={unitStep ? () => setUnitStep(false) : undefined}
      // "Klar" once something was added: what is added is saved (the sheet rule, Story 19.4).
      closeLabel={added && !item ? "Klar" : "Avbryt"}
      isDirty={isFormDirty(values, initial)}
      preventClose={saving}
      footer={
        unitStep ? undefined : (
          <>
            {item ? null : (
              // Mounted empty, so the first "La till …" is announced; just above "Lägg till", over the keyboard.
              <p role="status" data-testid="custom-item-added" className="flex items-center justify-center gap-1.5 text-meta text-ink-2 empty:-mb-2">
                {added ? (
                  <>
                    <CheckIcon size={16} className="shrink-0 text-accent" />
                    <span key={added.id}>{addedText(added.label)}</span>
                  </>
                ) : null}
              </p>
            )}
            {error ? (
              <Notice key={error.id} role="alert">
                {error.text}
              </Notice>
            ) : null}
            {formError ? <Notice role="alert">{formError}</Notice> : null}
            {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
            <Button type="submit" form={formId} fullWidth disabled={saving}>
              {saving ? "Sparar …" : item ? "Spara" : "Lägg till"}
            </Button>
            {item && onRemove ? (
              <div className="mt-3 border-t border-border pt-1">
                <Button
                  variant="danger"
                  fullWidth
                  disabled={saving}
                  onClick={remove}
                >
                  <TrashIcon size={20} />
                  Ta bort
                </Button>
              </div>
            ) : null}
          </>
        )
      }
    >
      {unitStep ? (
        <UnitList
          units={UNITS}
          value={values.unit}
          onChange={(unit) => {
            update({ unit });
            setUnitStep(false);
          }}
        />
      ) : null}
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        inert={saving}
        hidden={unitStep}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${ids}-label`}>Vara</FieldLabel>
          <Input
            ref={labelRef}
            id={`${ids}-label`}
            autoComplete="off"
            enterKeyHint="done"
            maxLength={maxCustomLabelLength}
            value={values.label}
            onChange={(event) => changeLabel(event.target.value)}
            {...describedBy("label", labelError)}
          />
          {labelError ? <FieldError id={`${ids}-label-error`}>{labelError}</FieldError> : null}
          {suggestions.length > 0 ? (
            <ul aria-label="Förslag" data-testid="custom-item-suggestions" className="flex flex-col">
              {suggestions.map((hit) => (
                <li key={hit.id} className="border-b border-hairline last:border-b-0">
                  <button
                    type="button"
                    onClick={() => choose(hit)}
                    className="flex min-h-tap w-full items-center rounded-sm px-1 text-left text-body text-ink"
                  >
                    {hit.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {suggestionsFailed ? (
            <p role="status" data-testid="custom-item-suggestions-unavailable" className="text-meta text-ink-2">
              {suggestionsUnavailableText}
            </p>
          ) : null}
          {values.link ? (
            <div className="flex items-center justify-between gap-3">
              <p data-testid="custom-item-link" className="min-w-0 text-meta text-ink-2">
                Kopplad till {values.link.name}
              </p>
              <Button variant="text" onClick={unlink} className="-mr-3 shrink-0">
                Ta bort kopplingen
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${ids}-amount`}>
            Mängd <span className="font-normal text-ink-2">(valfritt)</span>
          </FieldLabel>
          <AmountInput
            id={`${ids}-amount`}
            inputRef={amountRef}
            value={values.amount}
            onChange={(amount) => update({ amount })}
            stepper={values.unit === "" || isCountUnit(values.unit)}
            onStep={(direction) => {
              const next = stepAmountField(
                values.amount,
                values.unit,
                direction,
              );
              if (next !== null) update({ amount: next });
            }}
            canStepDown={
              stepAmountField(values.amount, values.unit, -1) !== null
            }
            canStepUp={stepAmountField(values.amount, values.unit, 1) !== null}
            unit={values.unit}
            maxLength={maxCustomAmountChars}
            invalid={Boolean(amountError)}
            describedBy={`${ids}-amount-error`}
          />
          {amountError ? (
            <FieldError id={`${ids}-amount-error`}>{amountError}</FieldError>
          ) : null}
          <span className="mt-1 text-control text-ink">
            Enhet <span className="font-normal text-ink-2">(valfritt)</span>
          </span>
          <UnitChoice
            ref={unitRef}
            units={UNITS}
            value={values.unit}
            onChange={(unit) => update({ unit })}
            onMore={() => setUnitStep(true)}
          />
          {unitError ? (
            <FieldError id={`${ids}-unit-error`}>{unitError}</FieldError>
          ) : null}
        </div>
      </form>
      {item && renderAfterForm ? (
        <div inert={saving} className="pt-6">
          {renderAfterForm(saving, isFormDirty(values, initial))}
        </div>
      ) : null}
    </Sheet>
  );
}
