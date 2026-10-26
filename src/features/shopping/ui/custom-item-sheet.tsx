"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input, inputClasses } from "@/components/field";
import { type IngredientHit, type SearchIngredients, useIngredientSearch } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { searchDelayMs } from "@/components/search-field";
import { Sheet } from "@/components/sheet";
import { UNITS, type Unit } from "@/features/catalog";
import { fail, type Result } from "@/lib/errors";
import { addCustomItem } from "../actions/add-custom-item";
import {
  customItemFieldErrors,
  customItemFormSchema,
  maxCustomAmountChars,
  maxCustomLabelLength,
  type CustomItemFormInput,
  type CustomItemRow,
} from "../domain/custom-item";

// Lägg till egen vara (FR-17, Story 3.5): the sheet that adds Pontus's own
// item to the list. He writes what he wants; while he types (after the
// Sökfält pause, 200 ms) the catalog suggests ingredients, and choosing one
// links the item to it, so it goes under that ingredient's section, else
// under Övrigt. Amount and unit are optional, both or neither. Nothing is
// ever written to the catalog from here: only the link is stored.

/** How many suggestions show under the field. */
export const maxSuggestions = 5;

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

function isFormDirty(values: FormValues): boolean {
  return values.label.trim() !== "" || values.link !== null || values.amount.trim() !== "" || values.unit !== "";
}

export type CustomItemSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The plan the list is counted for; the item is added to it. */
  planId: string;
  /** Searches the catalog for suggestions (catalog.searchIngredients, passed down from the page, AD-1). */
  searchIngredients: SearchIngredients;
  /**
   * Increases each time the sheet opens: the form then starts empty, with a
   * new id for the item. (The sheet stays mounted; see PantryItemSheet.)
   */
  session: number;
};

/**
 * Arket Lägg till egen vara: the text field (16 px, in focus from the start)
 * with the catalog's suggestions under it, then Mängd and Enhet. A chosen
 * suggestion puts its name in the field and shows "Kopplad till Kaffe" with
 * "Ta bort kopplingen"; the text can still be changed, and the link stays.
 * Only the link is stored: nothing is written to the catalog. "Lägg till"
 * saves with addCustomItem and closes the sheet; the list behind is read
 * again. The item's id is kept while the form is unchanged, so trying again
 * after a lost answer adds it once; a change to any field makes a new one,
 * so a changed item is never sent with an id already used. Unsaved text asks
 * "Släng ändringarna?" before the sheet closes.
 */
export function CustomItemSheet({ open, onClose, planId, searchIngredients, session }: CustomItemSheetProps) {
  const router = useRouter();
  const [formSession, setFormSession] = useState(session);
  const [values, setValues] = useState(emptyValues);
  const [itemId, setItemId] = useState<string | null>(null);
  /** Why saving failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The server's messages by field, shown at the field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The form's own errors show after a save attempt, not while typing. */
  const [attempted, setAttempted] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const unitRef = useRef<HTMLSelectElement>(null);
  const nextError = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { query, hits, error: searchError, search, reset: resetSearch } = useIngredientSearch(searchIngredients);
  const ids = useId();

  // A new session: the form starts empty (state adjusted while rendering).
  if (session !== formSession) {
    setFormSession(session);
    setValues(emptyValues);
    setItemId(null);
    setError(null);
    setServerFields({});
    setAttempted(false);
    // The last opening's suggestions are not this one's.
    resetSearch();
  }

  useEffect(() => () => clearTimeout(timer.current), []);
  // A search the last opening was waiting for never runs in this one.
  useEffect(() => () => clearTimeout(timer.current), [session]);

  // The text field has focus from the start. After the commit: the sheet's
  // showModal moves focus to its first control (see IngredientPicker).
  useEffect(() => {
    if (!open) return;
    let active = true;
    queueMicrotask(() => {
      if (active) labelRef.current?.focus();
    });
    return () => {
      active = false;
    };
  }, [open, session]);

  const [, save, saving] = useActionState(async (_previous: null, input: CustomItemFormInput) => {
    let result: Result<CustomItemRow>;
    try {
      result = await addCustomItem(input);
    } catch {
      // No answer (e.g. no connection): the form stays, with the same id for the next try.
      result = fail("shopping_save_failed");
    }
    if (result.ok) {
      // The action revalidated the list, so the list behind shows the item.
      onClose();
      return null;
    }
    const { code, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
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

  const input: CustomItemFormInput = {
    ...(itemId ? { id: itemId } : {}),
    planId,
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
   * next save is a new item with a new id (AD-20).
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
      else if (fields.unit) unitRef.current?.focus();
      return;
    }
    setError(null);
    // One id per opening: a retry after a lost answer adds the item once (AD-20).
    const id = itemId ?? crypto.randomUUID();
    if (!itemId) setItemId(id);
    const payload = { ...input, id };
    startTransition(() => save(payload));
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
      title="Lägg till egen vara"
      closeLabel="Avbryt"
      isDirty={isFormDirty(values)}
      preventClose={saving}
      footer={
        <>
          {error ? (
            <Notice key={error.id} role="alert">
              {error.text}
            </Notice>
          ) : null}
          {formError ? <Notice role="alert">{formError}</Notice> : null}
          {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
          <Button type="submit" form={formId} fullWidth disabled={saving}>
            {saving ? "Sparar …" : "Lägg till"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate inert={saving} className="flex flex-col gap-5">
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

        <div className="flex flex-col gap-1.5">
          <div className="flex gap-3">
            <div className="flex w-28 flex-col gap-1.5">
              <FieldLabel htmlFor={`${ids}-amount`}>Mängd</FieldLabel>
              <Input
                ref={amountRef}
                id={`${ids}-amount`}
                inputMode="decimal"
                autoComplete="off"
                maxLength={maxCustomAmountChars}
                value={values.amount}
                onChange={(event) => update({ amount: event.target.value })}
                {...describedBy("amount", amountError)}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <FieldLabel htmlFor={`${ids}-unit`}>Enhet</FieldLabel>
              <select
                ref={unitRef}
                id={`${ids}-unit`}
                value={values.unit}
                onChange={(event) => update({ unit: event.target.value as Unit | "" })}
                className={inputClasses}
                {...describedBy("unit", unitError)}
              >
                <option value="">Ingen enhet</option>
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {amountError ? <FieldError id={`${ids}-amount-error`}>{amountError}</FieldError> : null}
          {unitError ? <FieldError id={`${ids}-unit-error`}>{unitError}</FieldError> : null}
        </div>
      </form>
    </Sheet>
  );
}
