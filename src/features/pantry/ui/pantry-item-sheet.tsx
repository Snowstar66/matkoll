"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/button";
import { AmountInput } from "@/components/amount-input";
import { ChoiceRows } from "@/components/choice-rows";
import { FieldError, FieldLabel, Input, inputClasses } from "@/components/field";
import { FilterPills } from "@/components/filter-pills";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { useIngredientSearch } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { searchDelayMs } from "@/components/search-field";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import {
  catalogName,
  isCountUnit,
  LOCATIONS,
  normalizeIngredientText,
  SECTIONS,
  UNITS,
  type Location,
  type Section,
  type Unit,
} from "@/features/catalog";
import { lastChangeText } from "@/features/household";
import { fail, type Result } from "@/lib/errors";
import { searchPantryIngredients, type PantryIngredientHit } from "../actions/search-ingredients";
import { savePantryItem } from "../actions/set-pantry-item";
import type { PantryItem } from "../domain/pantry-item";
import {
  type PantryItemForm,
  formFieldErrors,
  collapseName,
  pantryItemFormSchema,
  pantryNewIngredientName,
  parseAmountField,
  stepAmountField,
  type PantryItemFormInput,
} from "../domain/pantry-item-form";
import { photoSiteId, suggestionGoneText, suggestionLabel, type PantrySuggestion } from "../domain/pantry-suggestion";
import { confirmedItemsText, savedItemText } from "../domain/places";
import { PhotoCrop, type PhotoCropProps } from "./analyzed-photo";
import { PantryRemovalProvider, usePantryRemoval } from "./pantry-removal";
import { type CorrectOutcome, type RejectOutcome, usePantrySuggestions } from "./pantry-suggestions";
import { useSiteSwitching } from "./site-switching";

// Lagervara (FR-11, Story 2.2): the sheet that adds an item to the pantry or
// changes one. "+" in Hemma's header, "Lägg till vara" in an empty location
// and a tap on an item open it, and so does Rätta on a lagerförslag (Story
// 6.2); PantrySheetProvider holds the one sheet for the page, so they all
// open the same (sheets never stack).
//
// Places (Story 8.2, FR-33): the target keeps the place the sheet was opened
// for (an item's own place, or the place Hemma showed), and "Lägg till vara"
// and "Spara ändringar" save there, also when Hemma selects another place
// while the sheet is open. A place deleted meanwhile is `pantry_site_gone`,
// shown in the sheet; the action has the page read again.

/**
 * What the sheet is for: a new item in a location of a place, an item
 * already in the pantry (on its own place), or a lagerförslag to correct.
 */
export type PantrySheetTarget =
  | { kind: "new"; location: Location; siteId: string }
  | { kind: "edit"; item: PantryItem }
  | SuggestionTarget;

/**
 * A lagerförslag to correct, the generation of suggestions it belongs to (a
 * newer photo replaces them), and its photo's place (Story 8.4; the place
 * Hemma showed when it opened for a photo without one). The sheet's
 * "Bekräfta" saves on the photo's place (confirmCorrected).
 */
export type SuggestionTarget = {
  kind: "suggestion";
  suggestion: PantrySuggestion;
  generation: number;
  siteId: string;
  /** Kylfoto D: the photo around the row's item, at the top of the sheet; none without a number. */
  crop?: PhotoCropProps;
};

/** What the sheet does for a lagerförslag, from PantrySuggestionsProvider. */
export type SuggestionReview = {
  /** "Bekräfta": saves the corrected suggestion; `onSaved` closes the sheet as the card goes. */
  confirm: (id: string, generation: number, form: PantryItemForm, onSaved: () => void) => Promise<CorrectOutcome>;
  /** "Avvisa". */
  reject: (id: string, generation: number) => RejectOutcome;
  /** A confirmation is being saved (here or from a card): "Bekräfta" and "Avvisa" wait. */
  saving: boolean;
};

type ChosenIngredient =
  | { kind: "existing"; ingredientId: string; name: string }
  | { kind: "new"; name: string; section: Section };

type FormValues = {
  /** The name as typed in "Namn"; empty for a new item until Pontus writes one. */
  name: string;
  /** What Pontus chose (a suggestion, "Använd … som namn") or the item started as; `resolveIngredient` reads it against `name`. */
  ingredient: ChosenIngredient | null;
  /** As typed; empty for an unlimited item. */
  amount: string;
  unit: Unit | "";
  location: Location;
  /** Story 11.2: "Märke eller sort" as typed; empty for none. */
  label: string;
};

/** The sheet's primary button. */
const submitLabel: Record<PantrySheetTarget["kind"], string> = {
  new: "Lägg till vara",
  edit: "Spara ändringar",
  suggestion: "Bekräfta",
};

/** A new catalog ingredient's section until Pontus picks one. */
const defaultSection: Section = "Övrigt";

/** An amount as the field shows it: exact, with a decimal comma (0,333 stays 0,333 when only the location changes). */
const amountField = (amount: number | null) => (amount === null ? "" : String(amount).replace(".", ","));

function initialValues(target: PantrySheetTarget): FormValues {
  if (target.kind === "new") return { name: "", ingredient: null, amount: "", unit: "", location: target.location, label: "" };
  if (target.kind === "suggestion") {
    const { suggestion } = target;
    const { ingredient } = suggestion;
    return {
      name: suggestion.name,
      ingredient:
        ingredient.kind === "existing"
          ? { kind: "existing", ingredientId: ingredient.ingredientId, name: suggestion.name }
          : { kind: "new", name: ingredient.name, section: ingredient.section },
      amount: amountField(suggestion.amount),
      unit: suggestion.unit ?? "",
      location: suggestion.location,
      // Story 11.2: the label the place's row has, or else the one the card's Bekräfta would save.
      label: suggestion.currentLabel ?? suggestionLabel(suggestion) ?? "",
    };
  }
  const { item } = target;
  return {
    name: item.name,
    ingredient: { kind: "existing", ingredientId: item.ingredientId, name: item.name },
    // The exact amount, not formatQuantity's rounding.
    amount: amountField(item.amount),
    unit: item.unit ?? "",
    location: item.location,
    label: item.label ?? "",
  };
}

function sameIngredient(a: ChosenIngredient | null, b: ChosenIngredient | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "existing" && b.kind === "existing") return a.ingredientId === b.ingredientId;
  return (
    a.kind === "new" &&
    b.kind === "new" &&
    normalizeIngredientText(a.name) === normalizeIngredientText(b.name) &&
    a.section === b.section
  );
}

/**
 * The ingredient the name in the field stands for: what Pontus chose while the
 * text still is its name; else a catalog hit that is the typed name (or one of
 * its synonyms); else a new ingredient in Övrigt, with no question first.
 */
function resolveIngredient(
  values: FormValues,
  hits: readonly PantryIngredientHit[] | null,
): ChosenIngredient | null {
  const text = collapseName(values.name);
  const normalized = normalizeIngredientText(text);
  if (!normalized) return null;
  const { ingredient } = values;
  if (ingredient && normalizeIngredientText(ingredient.name) === normalized) return ingredient;
  const found = hits?.find((hit) => hit.exact || normalizeIngredientText(hit.name) === normalized);
  if (found) return { kind: "existing", ingredientId: found.id, name: found.name };
  return { kind: "new", name: catalogName(text), section: defaultSection };
}

/** The most suggestions from the catalog shown under "Namn". */
const maxNameSuggestions = 5;

function isFormDirty(values: FormValues, initial: FormValues): boolean {
  return (
    collapseName(values.name) !== collapseName(initial.name) ||
    !sameIngredient(values.ingredient, initial.ingredient) ||
    values.amount.trim() !== initial.amount.trim() ||
    values.unit !== initial.unit ||
    values.location !== initial.location ||
    values.label.trim() !== initial.label.trim()
  );
}

/**
 * "Märke eller sort" as the sheet sends it (Story 11.2): an item in the
 * pantry always sends the field, so an emptied one removes its label. A new
 * item sends nothing when the field is empty, so a row it lands on keeps its
 * label. A lagerförslag sends the field only when Pontus changed it to
 * something: as filled in, the photo's label goes as a photo label
 * (confirmItemFromForm) and the row's own needs nothing, and empty keeps the
 * row's label.
 */
function labelInput(label: string, target: PantrySheetTarget): Pick<PantryItemFormInput, "label"> {
  if (target.kind === "edit") return { label };
  if (label.trim() === "") return {};
  if (target.kind === "suggestion" && label.trim() === initialValues(target).label.trim()) return {};
  return { label };
}

/** What savePantryItem takes; a new ingredient is kept where the item is. */
function toInput(values: FormValues, ingredient: ChosenIngredient, target: PantrySheetTarget): PantryItemFormInput {
  return {
    ingredient:
      ingredient.kind === "existing"
        ? { kind: "existing", ingredientId: ingredient.ingredientId }
        : { kind: "new", name: ingredient.name, section: ingredient.section, location: values.location },
    amount: values.amount,
    unit: values.unit,
    location: values.location,
    siteId: target.kind === "edit" ? target.item.siteId : target.siteId,
    replaceId: target.kind === "edit" ? target.item.id : null,
    ...labelInput(values.label, target),
  };
}

type SheetBaseProps = {
  open: boolean;
  onClose: () => void;
  /** An item was saved from the sheet (Story 11.3: Matvaror's search is emptied, so it never hides the item). */
  onSaved?: () => void;
  /**
   * Increases each time the sheet opens: the form then starts afresh from
   * `target`. (The sheet itself stays mounted; a sheet mounted already open
   * would be closed by React's double effects in development.)
   */
  session: number;
};

/** A lagerförslag needs its review; the other targets have none. */
export type PantryItemSheetProps =
  | (SheetBaseProps & { target: Exclude<PantrySheetTarget, SuggestionTarget> })
  | (SheetBaseProps & { target: SuggestionTarget; review: SuggestionReview });

/**
 * Arket Lagervara: "Namn" at the top, filled in for an item or a lagerförslag
 * and empty (with focus and the chosen location preselected) for a new item.
 * Writing over the name lists catalog hits under it, and the row Använd "x"
 * som namn; a name that is not in the catalog is saved as a new ingredient in
 * Övrigt without asking. Choosing a hit for a new item suggests its location
 * and unit. Then amount (optional: without one the item is unlimited) and
 * unit as a select on one row, the place of a new item, and "Märke eller
 * sort". An item stays where it is ("Ta bort" and add it again to move it),
 * and "Ta bort" removes it at once (the short confirmation offers "Ångra"). A
 * lagerförslag has "Bekräfta", which saves it as corrected, and "Avvisa".
 * Unsaved changes ask "Släng ändringarna?" before the sheet closes, but not
 * before "Ta bort" or "Avvisa".
 */
export function PantryItemSheet(props: PantryItemSheetProps) {
  const { open, onClose, onSaved, target, session } = props;
  const review = "review" in props ? props.review : null;
  const [formSession, setFormSession] = useState(session);
  const [initial, setInitial] = useState(() => initialValues(target));
  const [values, setValues] = useState(initial);
  /** One level deeper, replacing the form: the sections of a new ingredient. */
  const [step, setStep] = useState<"section" | null>(null);
  const { query: searched, hits, error: searchError, search, reset: resetSearch } = useIngredientSearch(searchPantryIngredients);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  // A new item opens with the name field in focus (after the commit: the dialog moves focus to its first control as it opens).
  const opensNew = open && target.kind === "new";
  useEffect(() => {
    if (!opensNew) return;
    let active = true;
    queueMicrotask(() => {
      if (active) nameRef.current?.focus();
    });
    return () => {
      active = false;
    };
  }, [opensNew, session]);
  // A new opening: a search waiting for the old text is dropped.
  useEffect(() => clearTimeout(searchTimer.current), [session]);
  /** Why saving failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<string | null>(null);
  /** The server's messages for fields (`amount`, `ingredient`), shown at the field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The amount's own error shows once Pontus has left the field or tried to save, not while typing. */
  const [amountTouched, setAmountTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  /** A corrected lagerförslag is being confirmed. */
  const [confirming, setConfirming] = useState(false);
  /** The same, at once: a double tap sends one confirmation. */
  const confirmingNow = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const { removeItem } = usePantryRemoval();
  const ids = useId();

  // A new session: the form starts from the target (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = initialValues(target);
    setFormSession(session);
    setInitial(fresh);
    setValues(fresh);
    setStep(null);
    resetSearch();
    setError(null);
    setServerFields({});
    setAmountTouched(false);
    setAttempted(false);
  }

  const [, save, actionSaving] = useActionState(
    async (_previous: null, { input, name }: { input: PantryItemFormInput; name: string }) => {
      let result: Result<{ id: string }>;
      try {
        result = await savePantryItem(input);
      } catch {
        // No answer (e.g. no connection): the form stays as it was.
        result = fail("pantry_save_failed");
      }
      if (!result.ok) {
        const fields = result.error.fields ?? {};
        if (Object.keys(fields).length > 0) setServerFields(fields);
        else setError(result.error.message);
        return null;
      }
      // The action revalidated Hemma, so the list behind shows the change.
      onClose();
      onSaved?.();
      showToast(savedItemText(name, input.location));
      return null;
    },
    null,
  );
  const saving = actionSaving || confirming || (review?.saving ?? false);

  /** The suggestion is gone (a newer photo replaced it): the sheet closes and says so. */
  function gone() {
    onClose();
    showToast(suggestionGoneText);
  }

  /**
   * The sheet's "Bekräfta" for a lagerförslag: on success the sheet closes
   * and the card goes; on failure the form stays. Another confirmation being
   * saved makes it do nothing.
   */
  async function confirmSuggestion(suggestionTarget: SuggestionTarget, form: PantryItemForm, name: string) {
    if (!review || confirmingNow.current) return;
    confirmingNow.current = true;
    setConfirming(true);
    let outcome: CorrectOutcome;
    try {
      // Closed as the card goes, in one update: the sheet gives focus back first, then focus moves on.
      outcome = await review.confirm(suggestionTarget.suggestion.id, suggestionTarget.generation, form, () => {
        onClose();
        onSaved?.();
        showToast(savedItemText(name, form.location));
      });
    } catch {
      outcome = { kind: "failed", error: fail("pantry_confirm_failed").error };
    }
    confirmingNow.current = false;
    setConfirming(false);
    switch (outcome.kind) {
      case "failed":
        // The server names a refused item by its index; the sheet has one.
        setError(outcome.error.fields?.["0"] ?? outcome.error.message);
        break;
      case "savedStale":
        onClose();
        onSaved?.();
        showToast(confirmedItemsText(1));
        break;
      case "gone":
        gone();
        break;
      default:
        // Saved (the sheet is closed), or another confirmation was being saved.
        break;
    }
  }

  // Hits belong to the text searched last; read only when that still is the name.
  const nameHits =
    hits && normalizeIngredientText(searched) === normalizeIngredientText(values.name) ? hits : null;
  const ingredient = resolveIngredient(values, nameHits);
  const input = ingredient ? toInput(values, ingredient, target) : null;
  const parsed = input ? pantryItemFormSchema.safeParse(input) : null;
  const fieldErrors = parsed && !parsed.success ? formFieldErrors(parsed.error) : {};
  const amount = parseAmountField(values.amount);
  const liveAmountError = "error" in amount && (amountTouched || attempted) ? amount.error : null;
  const amountError = serverFields.amount ?? liveAmountError;
  // maxLength keeps the field short; a longer text (set by a script) shows why at once.
  const labelError = serverFields.label ?? fieldErrors.label ?? null;
  const nameError =
    serverFields.ingredient ?? fieldErrors.ingredient ?? (attempted && !ingredient ? "Skriv vad det är." : null);
  /** Shown after a save attempt when the form is invalid without a field to point at. */
  const formError =
    attempted && parsed && !parsed.success && Object.keys(fieldErrors).length === 0 ? fail("validation").error.message : null;
  const isDirty = isFormDirty(values, initial);

  /** A change to any field: the last save's errors no longer apply. */
  const update = (changes: Partial<FormValues>) => {
    setError(null);
    setServerFields({});
    setValues((current) => ({ ...current, ...changes }));
  };

  /** Typing in "Namn": the catalog is searched after the pause, as in any search field. */
  function changeName(name: string) {
    update({ name });
    clearTimeout(searchTimer.current);
    if (!name.trim()) {
      void search("");
      return;
    }
    searchTimer.current = setTimeout(() => void search(name), searchDelayMs);
  }

  function choose(hit: PantryIngredientHit) {
    // For a new item the catalog suggests where it is kept and its unit; Pontus
    // can change both. Renaming an item keeps it where it is.
    clearTimeout(searchTimer.current);
    const defaults = target.kind === "new" ? hit.defaults : null;
    update({
      name: hit.name,
      ingredient: { kind: "existing", ingredientId: hit.id, name: hit.name },
      ...(defaults ? { location: defaults.location, unit: defaults.defaultUnit ?? values.unit } : {}),
    });
  }

  function chooseNew(name: string) {
    clearTimeout(searchTimer.current);
    update({ name, ingredient: { kind: "new", name, section: defaultSection } });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!input || !ingredient || !parsed) {
      // No name: nothing is saved, and the field says so.
      setAttempted(true);
      nameRef.current?.focus();
      return;
    }
    if (!parsed.success) {
      // Nothing is saved; the reasons show at their fields.
      setAttempted(true);
      if ("error" in amount) amountRef.current?.focus();
      return;
    }
    setError(null);
    if (target.kind === "suggestion") {
      void confirmSuggestion(target, parsed.data, ingredient.name);
      return;
    }
    const payload = { input, name: ingredient.name };
    startTransition(() => save(payload));
  }

  /** "Avvisa": no question first, even with unsaved changes; the confirmation offers "Ångra". */
  function rejectSuggestion() {
    if (target.kind !== "suggestion" || !review || saving) return;
    const outcome = review.reject(target.suggestion.id, target.generation);
    // "busy": nothing happened, so the sheet stays open.
    if (outcome === "rejected") onClose();
    else if (outcome === "gone") gone();
  }

  /** "Ta bort": no question first, even with unsaved changes; the confirmation offers "Ångra" (Story 2.3). */
  function remove() {
    if (target.kind !== "edit" || saving) return;
    onClose();
    removeItem(target.item, { moveFocus: true });
  }

  const formId = `${ids}-form`;
  const footer =
    step ? null : (
      <>
        {error ? <Notice role="alert">{error}</Notice> : null}
        {formError ? <Notice role="alert">{formError}</Notice> : null}
        {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
        <Button type="submit" form={formId} fullWidth disabled={saving}>
          {saving ? "Sparar …" : submitLabel[target.kind]}
        </Button>
        {target.kind === "edit" ? (
          // Story 16.17: Ta bort stands last under a line, in muted red, so it never looks like a second way on.
          <div className="mt-3 border-t border-border pt-1">
            <Button variant="danger" fullWidth disabled={saving} onClick={remove}>
              <TrashIcon size={20} />
              Ta bort
            </Button>
          </div>
        ) : null}
        {target.kind === "suggestion" ? (
          <div className="mt-3 border-t border-border pt-1">
            <Button variant="quiet" fullWidth disabled={saving} onClick={rejectSuggestion}>
              Inte en vara
            </Button>
          </div>
        ) : null}
      </>
    );

  const stepHeading = step === "section" ? "Avdelning" : null;
  const title = stepHeading ?? (target.kind === "new" ? "Lägg till vara" : "Ändra vara");
  const choosePlace = target.kind === "new";

  /** The amount stepper: − and + move the amount by the unit's step (see stepAmountField). */
  function stepAmount(direction: 1 | -1) {
    const next = stepAmountField(values.amount, values.unit, direction);
    if (next !== null) update({ amount: next });
  }
  const canStepDown = stepAmountField(values.amount, values.unit, -1) !== null;
  const canStepUp = stepAmountField(values.amount, values.unit, 1) !== null;
  const countable = values.unit === "" || isCountUnit(values.unit);

  // Suggestions while the text is not the name of what is chosen (or, for a new item, until something is).
  const typedName = collapseName(values.name);
  const suggesting =
    typedName !== "" && normalizeIngredientText(typedName) !== normalizeIngredientText(values.ingredient?.name ?? "");
  const shownHits = suggesting && nameHits ? nameHits.slice(0, maxNameSuggestions) : [];
  const useName = suggesting && nameHits ? pantryNewIngredientName(values.name, nameHits) : null;
  const suggestionsFailed = suggesting && searchError !== null;
  /** The section row is for a new ingredient a photo suggested, still named as suggested. */
  const sectionRow = ingredient?.kind === "new" && ingredient === values.ingredient && initial.ingredient?.kind === "new";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      // Story 21.3: under the name, who else last added or changed the item ("Martina ändrade · 1 nov").
      subtitle={target.kind === "edit" && target.item.lastChange && !step ? lastChangeText(target.item.lastChange) : undefined}
      onBack={step ? () => setStep(null) : undefined}
      closeLabel="Avbryt"
      isDirty={isDirty}
      preventClose={saving}
      footer={footer}
    >
      {step === "section" && ingredient?.kind === "new" ? (
        <ChoiceRows
          label="Avdelning"
          options={SECTIONS.map((section) => ({
            value: section,
            label: section,
          }))}
          value={ingredient.section}
          onChange={(section) => {
            update({ ingredient: { ...ingredient, section } });
            setStep(null);
          }}
        />
      ) : (
        <form id={formId} onSubmit={submit} noValidate inert={saving} className="flex flex-col gap-5">
          {target.kind === "suggestion" && target.crop ? <PhotoCrop {...target.crop} /> : null}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={`${ids}-name`}>Namn</FieldLabel>
            <Input
              id={`${ids}-name`}
              ref={nameRef}
              autoComplete="off"
              maxLength={200}
              placeholder={target.kind === "new" ? "Börja skriva, till exempel “gul lök”" : undefined}
              value={values.name}
              onChange={(event) => changeName(event.target.value)}
              {...(nameError ? { "aria-invalid": true, "aria-describedby": `${ids}-name-error` } : {})}
            />
            {nameError ? (
              <FieldError id={`${ids}-name-error`} role="alert">
                {nameError}
              </FieldError>
            ) : null}
            {suggestionsFailed ? <Notice role="alert">{searchError?.message}</Notice> : null}
            {shownHits.length > 0 || useName ? (
              <ul aria-label="Förslag" className="flex flex-col overflow-hidden rounded-md border border-border">
                {shownHits.map((hit) => (
                  <li key={hit.id} className="border-b border-hairline last:border-b-0">
                    <button
                      type="button"
                      onClick={() => choose(hit)}
                      className="flex min-h-tap w-full items-center px-4 text-left text-body text-ink"
                    >
                      {hit.name}
                    </button>
                  </li>
                ))}
                {useName ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => chooseNew(useName)}
                      className="flex min-h-tap w-full items-center px-4 text-left text-body font-medium text-accent"
                    >
                      Använd {"“"}
                      {useName}
                      {"”"} som namn
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          {sectionRow && ingredient?.kind === "new" ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-control text-ink">Avdelning</span>
              <button
                type="button"
                aria-label={`Avdelning: ${ingredient.section}`}
                aria-haspopup="dialog"
                onClick={() => setStep("section")}
                className="flex h-12 items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 text-left text-body text-ink"
              >
                {ingredient.section}
                <ChevronRightIcon size={18} className="text-ink-3" />
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1.5">
            <FieldLabel htmlFor={`${ids}-amount`}>Mängd</FieldLabel>
            <FieldLabel htmlFor={`${ids}-unit`}>Enhet</FieldLabel>
            <div>
              <AmountInput
                id={`${ids}-amount`}
                inputRef={amountRef}
                value={values.amount}
                onChange={(amount) => update({ amount })}
                stepper={countable}
                onStep={stepAmount}
                canStepDown={canStepDown}
                canStepUp={canStepUp}
                onBlur={() => setAmountTouched(true)}
                invalid={Boolean(amountError)}
                describedBy={`${ids}-amount-error`}
              />
            </div>
            <div className="relative">
              <select
                id={`${ids}-unit`}
                value={values.unit}
                onChange={(event) => update({ unit: event.target.value as Unit | "" })}
                className={`${inputClasses} cursor-pointer appearance-none pr-10`}
              >
                <option value="">Ingen enhet</option>
                {UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <ChevronDownIcon
                size={18}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-3"
              />
            </div>
            {amountError ? (
              <FieldError id={`${ids}-amount-error`} className="col-span-2">
                {amountError}
              </FieldError>
            ) : null}
          </div>

          {choosePlace ? (
            <div className="flex flex-col gap-2">
              {/* The pills are a radio group named "Plats"; this is its visible label. */}
              <span aria-hidden="true" className="text-body font-medium text-ink">
                Plats
              </span>
              <FilterPills
                label="Plats"
                segmented
                tall
                options={LOCATIONS.map((location) => ({ value: location, label: location }))}
                value={values.location}
                onChange={(location) => update({ location })}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={`${ids}-label`}>
              Märke eller sort <span className="font-normal text-ink-2">(valfritt)</span>
            </FieldLabel>
            <Input
              id={`${ids}-label`}
              autoComplete="off"
              placeholder="Till exempel Arla laktosfri"
              value={values.label}
              onChange={(event) => update({ label: event.target.value })}
              {...(labelError ? { "aria-invalid": true, "aria-describedby": `${ids}-label-error` } : {})}
            />
            {labelError ? <FieldError id={`${ids}-label-error`}>{labelError}</FieldError> : null}
          </div>
        </form>
      )}
    </Sheet>
  );
}

/** The place Hemma shows; a new item is saved there (FR-33). */
export type PantrySheetSite = { id: string };

type PantrySheetApi = {
  /** Opens the sheet for a new item in the chosen location. */
  openNew: () => void;
  /** Opens the sheet for an item in the pantry. */
  openItem: (item: PantryItem) => void;
  /** Rätta: opens the sheet for a lagerförslag, filled in from it, with the photo around its item when given (Kylfoto D). */
  openSuggestion: (suggestion: PantrySuggestion, crop?: PhotoCropProps) => void;
  /** How many times an item has been saved from the sheet; Matvaror's search empties when it grows. */
  saves: number;
};

const PantrySheetContext = createContext<PantrySheetApi | null>(null);

/** Opens the sheet Lagervara; needs a PantrySheetProvider above. */
export function usePantrySheet(): PantrySheetApi {
  const api = useContext(PantrySheetContext);
  if (!api) throw new Error("usePantrySheet needs a PantrySheetProvider");
  return api;
}

/**
 * Holds the sheet Lagervara for Hemma, so "+", "Lägg till vara" and a tap on
 * an item all open the same sheet, and the removals with "Ångra" that the
 * list and the sheet share (PantryRemovalProvider). `location` is the chosen
 * location: a new item starts there. The sheet's "Bekräfta" and "Avvisa" for
 * a lagerförslag come from PantrySuggestionsProvider. `site` is the place
 * Hemma shows: the sheet keeps it from the moment it opens (FR-33). Needs a
 * ToastProvider and a PantrySuggestionsProvider above.
 */
export function PantrySheetProvider({
  location,
  site,
  children,
}: {
  location: Location;
  site: PantrySheetSite;
  children: ReactNode;
}) {
  const { confirmCorrected, reject, saving, generation, latestResult } = usePantrySuggestions();
  const review: SuggestionReview = { confirm: confirmCorrected, reject, saving };
  const [sheet, setSheet] = useState<{ open: boolean; session: number; target: PantrySheetTarget }>({
    open: false,
    session: 0,
    target: { kind: "new", location, siteId: site.id },
  });
  const [saves, setSaves] = useState(0);
  const openWith = (target: PantrySheetTarget) =>
    setSheet((current) => ({ open: true, session: current.session + 1, target }));
  const sheetProps: SheetBaseProps = {
    open: sheet.open,
    session: sheet.session,
    onClose: () => setSheet((current) => ({ ...current, open: false })),
    onSaved: () => setSaves((count) => count + 1),
  };
  const api: PantrySheetApi = {
    openNew: () => openWith({ kind: "new", location, siteId: site.id }),
    openItem: (item) => openWith({ kind: "edit", item }),
    // A suggestion keeps its photo's place (Story 8.4), which confirmCorrected sends.
    openSuggestion: (suggestion, crop) => {
      const current = generation();
      const photo = latestResult(current);
      const photoSite = photo ? photoSiteId(photo) : null;
      openWith({ kind: "suggestion", suggestion, generation: current, siteId: photoSite ?? site.id, crop });
    },
    saves,
  };
  return (
    <PantryRemovalProvider>
      <PantrySheetContext.Provider value={api}>
        {children}
        {/* One sheet, mounted in the same place for every target. */}
        {sheet.target.kind === "suggestion" ? (
          <PantryItemSheet {...sheetProps} target={sheet.target} review={review} />
        ) : (
          <PantryItemSheet {...sheetProps} target={sheet.target} />
        )}
      </PantrySheetContext.Provider>
    </PantryRemovalProvider>
  );
}

/**
 * Opens the sheet for a new item: the round "+" for the page header, a
 * primary button, or a text button (in a notice). Unavailable while Hemma
 * switches place (useSiteSwitching), so nothing is added to the place being
 * left while the pill shows the new one.
 */
export function AddPantryItemButton({ variant }: { variant: "icon" | "primary" | "text" }) {
  const { openNew } = usePantrySheet();
  const switching = useSiteSwitching();
  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Lägg till vara"
        disabled={switching}
        onClick={openNew}
        className="flex size-tap items-center justify-center rounded-full text-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PlusIcon size={26} />
      </button>
    );
  }
  return (
    <Button variant={variant} disabled={switching} onClick={openNew}>
      Lägg till vara
    </Button>
  );
}
