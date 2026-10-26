"use client";

import {
  createContext,
  type FormEvent,
  type ReactNode,
  startTransition,
  useActionState,
  useContext,
  useId,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input, inputClasses } from "@/components/field";
import { FilterPills } from "@/components/filter-pills";
import { PlusIcon } from "@/components/icons";
import { IngredientPicker } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import {
  LOCATIONS,
  SECTIONS,
  UNITS,
  type Location,
  type Section,
  type Unit,
} from "@/features/catalog";
import { fail, type Result } from "@/lib/errors";
import { searchPantryIngredients, type PantryIngredientHit } from "../actions/search-ingredients";
import { savePantryItem } from "../actions/set-pantry-item";
import type { PantryItem } from "../domain/pantry-item";
import {
  formFieldErrors,
  pantryItemFormSchema,
  pantryNewIngredientName,
  parseAmountField,
  type PantryItemFormInput,
} from "../domain/pantry-item-form";
import { savedItemText } from "../domain/places";

// Lagervara (FR-11, Story 2.2): the sheet that adds an item to the pantry or
// changes one. "+" in Hemma's header, "Lägg till vara" in an empty location
// and a tap on an item open it; PantrySheetProvider holds the one sheet for
// the page, so they all open the same (sheets never stack).

/** What the sheet is for: a new item in a location, or an item already in the pantry. */
export type PantrySheetTarget = { kind: "new"; location: Location } | { kind: "edit"; item: PantryItem };

type ChosenIngredient =
  | { kind: "existing"; ingredientId: string; name: string }
  | { kind: "new"; name: string; section: Section };

type FormValues = {
  ingredient: ChosenIngredient | null;
  /** As typed; empty for an unlimited item. */
  amount: string;
  unit: Unit | "";
  location: Location;
};

/** A new catalog ingredient's section until Pontus picks one. */
const defaultSection: Section = "Övrigt";

function initialValues(target: PantrySheetTarget): FormValues {
  if (target.kind === "new") return { ingredient: null, amount: "", unit: "", location: target.location };
  const { item } = target;
  return {
    ingredient: { kind: "existing", ingredientId: item.ingredientId, name: item.name },
    // The exact amount, not formatQuantity's rounding: 0,333 must stay 0,333 when only the location changes.
    amount: item.amount === null ? "" : String(item.amount).replace(".", ","),
    unit: item.unit ?? "",
    location: item.location,
  };
}

function sameIngredient(a: ChosenIngredient | null, b: ChosenIngredient | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === "existing" && b.kind === "existing") return a.ingredientId === b.ingredientId;
  return a.kind === "new" && b.kind === "new" && a.name === b.name && a.section === b.section;
}

function isFormDirty(values: FormValues, initial: FormValues): boolean {
  return (
    !sameIngredient(values.ingredient, initial.ingredient) ||
    values.amount.trim() !== initial.amount.trim() ||
    values.unit !== initial.unit ||
    values.location !== initial.location
  );
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
    replaceId: target.kind === "edit" ? target.item.id : null,
  };
}

export type PantryItemSheetProps = {
  open: boolean;
  onClose: () => void;
  target: PantrySheetTarget;
  /**
   * Increases each time the sheet opens: the form then starts afresh from
   * `target`. (The sheet itself stays mounted; a sheet mounted already open
   * would be closed by React's double effects in development.)
   */
  session: number;
};

/**
 * Arket Lagervara: a new item starts in the catalog search with the field in
 * focus and the chosen location preselected; choosing an ingredient suggests
 * its location and unit from the catalog, and "Lägg till … som ny" asks for
 * the new ingredient's section. Then amount (optional: without one the item
 * is unlimited), unit and location. An item already in the pantry opens on
 * the form; changing its location or unit moves it. Unsaved changes ask
 * "Släng ändringarna?" before the sheet closes.
 */
export function PantryItemSheet({ open, onClose, target, session }: PantryItemSheetProps) {
  const [formSession, setFormSession] = useState(session);
  const [initial, setInitial] = useState(() => initialValues(target));
  const [values, setValues] = useState(initial);
  const [picking, setPicking] = useState(target.kind === "new");
  /** Why saving failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<string | null>(null);
  /** The server's messages for fields (`amount`, `ingredient`), shown at the field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The amount's own error shows once Pontus has left the field or tried to save, not while typing. */
  const [amountTouched, setAmountTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const ids = useId();

  // A new session: the form starts from the target (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = initialValues(target);
    setFormSession(session);
    setInitial(fresh);
    setValues(fresh);
    setPicking(target.kind === "new");
    setError(null);
    setServerFields({});
    setAmountTouched(false);
    setAttempted(false);
  }

  const [, save, saving] = useActionState(
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
      showToast(savedItemText(name, input.location));
      return null;
    },
    null,
  );

  const { ingredient } = values;
  const input = ingredient ? toInput(values, ingredient, target) : null;
  const parsed = input ? pantryItemFormSchema.safeParse(input) : null;
  const fieldErrors = parsed && !parsed.success ? formFieldErrors(parsed.error) : {};
  const amount = parseAmountField(values.amount);
  const liveAmountError = "error" in amount && (amountTouched || attempted) ? amount.error : null;
  const amountError = serverFields.amount ?? liveAmountError;
  // A new ingredient's name is not typed here, so its problem shows at once.
  const ingredientError = serverFields.ingredient ?? fieldErrors.ingredient ?? null;
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

  function choose(hit: PantryIngredientHit) {
    // For a new item the catalog suggests where it is kept and its unit; Pontus
    // can change both. Swapping the ingredient of an item keeps it where it is.
    const defaults = target.kind === "new" ? hit.defaults : null;
    update({
      ingredient: { kind: "existing", ingredientId: hit.id, name: hit.name },
      ...(defaults ? { location: defaults.location, unit: defaults.defaultUnit ?? values.unit } : {}),
    });
    setPicking(false);
  }

  function chooseNew(name: string) {
    update({ ingredient: { kind: "new", name, section: defaultSection } });
    setPicking(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input || !ingredient || !parsed || saving) return;
    if (!parsed.success) {
      // Nothing is saved; the reasons show at their fields.
      setAttempted(true);
      if ("error" in amount) amountRef.current?.focus();
      return;
    }
    setError(null);
    const payload = { input, name: ingredient.name };
    startTransition(() => save(payload));
  }

  const formId = `${ids}-form`;
  const footer =
    picking || !ingredient ? null : (
      <>
        {error ? <Notice role="alert">{error}</Notice> : null}
        {formError ? <Notice role="alert">{formError}</Notice> : null}
        {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
        <Button type="submit" form={formId} fullWidth disabled={saving}>
          {saving ? "Sparar …" : target.kind === "new" ? "Lägg till vara" : "Spara ändringar"}
        </Button>
      </>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Lagervara"
      closeLabel="Avbryt"
      isDirty={isDirty}
      preventClose={saving}
      footer={footer}
    >
      {picking || !ingredient ? (
        <IngredientPicker
          searchIngredients={searchPantryIngredients}
          newName={pantryNewIngredientName}
          onChoose={choose}
          onNew={chooseNew}
          onCancel={ingredient ? () => setPicking(false) : undefined}
          header={
            ingredient ? (
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-row-title text-ink">Byt ingrediens</h3>
                <Button variant="text" onClick={() => setPicking(false)} className="-mr-3">
                  Avbryt
                </Button>
              </div>
            ) : null
          }
        />
      ) : (
        <form id={formId} onSubmit={submit} noValidate inert={saving} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span data-testid="pantry-sheet-ingredient" className="text-row-title text-ink">
                  {ingredient.name}
                </span>
                {ingredient.kind === "new" ? <Badge tone="neutral">Ny</Badge> : null}
              </div>
              <Button variant="text" aria-label="Byt ingrediens" onClick={() => setPicking(true)} className="-mr-3">
                Byt
              </Button>
            </div>
            {ingredientError ? <FieldError role="alert">{ingredientError}</FieldError> : null}
          </div>

          {ingredient.kind === "new" ? (
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={`${ids}-section`}>Avdelning</FieldLabel>
              <select
                id={`${ids}-section`}
                value={ingredient.section}
                onChange={(event) => update({ ingredient: { ...ingredient, section: event.target.value as Section } })}
                className={inputClasses}
              >
                {SECTIONS.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex gap-3">
              <div className="flex w-28 flex-col gap-1.5">
                <FieldLabel htmlFor={`${ids}-amount`}>Mängd</FieldLabel>
                <Input
                  ref={amountRef}
                  id={`${ids}-amount`}
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  value={values.amount}
                  onChange={(event) => update({ amount: event.target.value })}
                  onBlur={() => setAmountTouched(true)}
                  {...(amountError ? { "aria-invalid": true, "aria-describedby": `${ids}-amount-error` } : {})}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <FieldLabel htmlFor={`${ids}-unit`}>Enhet</FieldLabel>
                <select
                  id={`${ids}-unit`}
                  value={values.unit}
                  onChange={(event) => update({ unit: event.target.value as Unit | "" })}
                  className={inputClasses}
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
          </div>

          <div className="flex flex-col gap-1.5">
            {/* The pills are a radio group named "Plats"; this is its visible label. */}
            <span aria-hidden="true" className="text-body font-semibold text-ink">
              Plats
            </span>
            <FilterPills
              label="Plats"
              options={LOCATIONS.map((location) => ({ value: location, label: location }))}
              value={values.location}
              onChange={(location) => update({ location })}
            />
          </div>
        </form>
      )}
    </Sheet>
  );
}

type PantrySheetApi = {
  /** Opens the sheet for a new item in the chosen location. */
  openNew: () => void;
  /** Opens the sheet for an item in the pantry. */
  openItem: (item: PantryItem) => void;
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
 * an item all open the same sheet. `location` is the chosen location: a new
 * item starts there.
 */
export function PantrySheetProvider({ location, children }: { location: Location; children: ReactNode }) {
  const [sheet, setSheet] = useState<{ open: boolean; session: number; target: PantrySheetTarget }>({
    open: false,
    session: 0,
    target: { kind: "new", location },
  });
  const openWith = (target: PantrySheetTarget) =>
    setSheet((current) => ({ open: true, session: current.session + 1, target }));
  const api: PantrySheetApi = {
    openNew: () => openWith({ kind: "new", location }),
    openItem: (item) => openWith({ kind: "edit", item }),
  };
  return (
    <PantrySheetContext.Provider value={api}>
      {children}
      <PantryItemSheet
        open={sheet.open}
        session={sheet.session}
        target={sheet.target}
        onClose={() => setSheet((current) => ({ ...current, open: false }))}
      />
    </PantrySheetContext.Provider>
  );
}

/** Opens the sheet for a new item: the round "+" for the page header, or a primary button. */
export function AddPantryItemButton({ variant }: { variant: "icon" | "primary" }) {
  const { openNew } = usePantrySheet();
  if (variant === "icon") {
    return (
      <button
        type="button"
        aria-label="Lägg till vara"
        onClick={openNew}
        className="flex size-tap items-center justify-center rounded-full text-accent"
      >
        <PlusIcon size={26} />
      </button>
    );
  }
  return <Button onClick={openNew}>Lägg till vara</Button>;
}
