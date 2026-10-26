"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input, inputClasses } from "@/components/field";
import { IngredientPicker, type SearchIngredients } from "@/components/ingredient-picker";
import { Stepper } from "@/components/stepper";
import { UNITS, formatQuantity, newIngredientName, type Unit } from "@/features/catalog";
import {
  ingredientLabel,
  needsCheck,
  parseAmountInput,
  parseMinutesInput,
  withAmount,
  withChosenIngredient,
  withNewIngredient,
  withNewStep,
  withStepText,
  withUnit,
  withoutLine,
  withoutPendingAmount,
  withoutStep,
} from "../domain/preview";
import {
  draftLimits,
  stepId,
  stepText,
  type PendingFieldText,
  type RecipeDraft,
  type RecipeLine,
  type RecipeStep,
} from "../domain/recipe-draft";
import { sourceLabel } from "../domain/source-label";

export type RecipePreviewProps = {
  draft: RecipeDraft;
  /** Names of the matched and chosen catalog ingredients, by id. */
  names: Readonly<Record<string, string>>;
  onChange: (draft: RecipeDraft, names: Readonly<Record<string, string>>) => void;
  /** Typed text that did not become a value; kept by the caller so it counts as a change. */
  pending: PendingFieldText;
  onPendingChange: (pending: PendingFieldText) => void;
  /** Field errors from validateDraft(draft, pending), shown under each field. */
  errors: Readonly<Record<string, string>>;
  searchIngredients: SearchIngredients;
  /** "Tillbaka till texten" (or `backLabel`); leaves the preview as it is. Without it, no back button (Ändra recept). */
  onBack?: () => void;
  /** The back button's text; "Tillbaka till länken" for a link. */
  backLabel?: string;
  /** Shown at the bottom of the form, not while an ingredient is being picked ("Ta bort recept"). */
  end?: ReactNode;
};

const textareaClasses =
  "w-full rounded-md border border-ink-3 bg-surface px-4 py-3 text-body text-ink placeholder:text-ink-3 aria-[invalid=true]:border-sky-ink";

/** Props for a field with an error from `errors`. */
function invalidProps(error: string | undefined, errorId: string) {
  return error ? { "aria-invalid": true, "aria-describedby": errorId } : {};
}

let rowKeyCount = 0;
/** A React key for a line or step without a saved id; unique in the page. */
const newRowKey = () => `ny-${++rowKeyCount}`;
const lineKeysOf = (lines: readonly RecipeLine[]) => lines.map((line) => line.id ?? newRowKey());
const stepKeysOf = (steps: readonly RecipeStep[]) => steps.map((step) => stepId(step) ?? newRowKey());

/**
 * Förhandsgranskning (FR-5, FR-6): the recipe in Matkoll's format before
 * anything is saved. Title, servings, time, amounts, units, catalog
 * ingredients and steps can be changed, and lines and steps removed and
 * steps added. An uncertain match has a light-blue ring and "Kontrollera"; a
 * new catalog ingredient is marked "Ny". Focus starts in the title. Ändra
 * recept (Story 1.11) uses the same form for a saved recipe.
 */
export function RecipePreview({
  draft,
  names,
  onChange,
  pending,
  onPendingChange,
  errors,
  searchIngredients,
  onBack,
  backLabel = "Tillbaka till texten",
  end,
}: RecipePreviewProps) {
  const [picking, setPicking] = useState<number | null>(null);
  /** The key of the line whose amount editor is open. */
  const [editing, setEditing] = useState<string | null>(null);
  /**
   * Stable React keys for the lines and steps, in the draft's order: the saved
   * id, or one made here. Rows can be removed, so an index would hand one
   * row's state (an open amount editor, typed text) to the next.
   */
  const [lineKeys, setLineKeys] = useState(() => lineKeysOf(draft.lines));
  const [stepKeys, setStepKeys] = useState(() => stepKeysOf(draft.steps));
  // A draft replaced from outside: new keys (state adjusted while rendering).
  if (lineKeys.length !== draft.lines.length) setLineKeys(lineKeysOf(draft.lines));
  if (stepKeys.length !== draft.steps.length) setStepKeys(stepKeysOf(draft.steps));
  const [minutesText, setMinutesText] = useState(
    pending.totalMinutes ?? (draft.totalMinutes === null ? "" : String(draft.totalMinutes)),
  );
  const ingredientButtons = useRef(new Map<number, HTMLButtonElement>());
  const returnFocusTo = useRef<number | null>(null);
  /** Where focus goes once a removed or added line or step is gone or there. */
  const focusAfterChange = useRef<{ kind: "line" | "step"; index: number } | null>(null);
  const linesHeading = useRef<HTMLHeadingElement>(null);
  const addStepButton = useRef<HTMLButtonElement>(null);
  const ids = useId();

  useEffect(() => {
    const target = focusAfterChange.current;
    if (!target) return;
    focusAfterChange.current = null;
    if (target.kind === "line") {
      (ingredientButtons.current.get(target.index) ?? linesHeading.current)?.focus();
    } else {
      (document.getElementById(`${ids}-step-${target.index}`) ?? addStepButton.current)?.focus();
    }
  }, [draft.lines.length, draft.steps.length, ids]);
  // Back from the picker: focus the line's ingredient again.
  useEffect(() => {
    if (picking !== null || returnFocusTo.current === null) return;
    ingredientButtons.current.get(returnFocusTo.current)?.focus();
    returnFocusTo.current = null;
  }, [picking]);

  const update = (changes: Partial<RecipeDraft>, nextNames = names) => onChange({ ...draft, ...changes }, nextNames);
  const updateLine = (index: number, line: RecipeLine, nextNames = names) =>
    update({ lines: draft.lines.map((current, i) => (i === index ? line : current)) }, nextNames);

  function setPendingAmount(index: number, text: string | undefined) {
    const amounts = { ...pending.amounts };
    if (text === undefined) delete amounts[index];
    else amounts[index] = text;
    onPendingChange({ ...pending, amounts });
  }

  function removeLine(index: number) {
    setLineKeys((keys) => keys.filter((_, i) => i !== index));
    focusAfterChange.current = { kind: "line", index: Math.min(index, draft.lines.length - 2) };
    // Typed amounts are kept by line index, so later lines' move up with them.
    onPendingChange(withoutPendingAmount(pending, index));
    onChange(withoutLine(draft, index), names);
  }

  function removeStep(index: number) {
    setStepKeys((keys) => keys.filter((_, i) => i !== index));
    focusAfterChange.current = { kind: "step", index: Math.min(index, draft.steps.length - 2) };
    onChange(withoutStep(draft, index), names);
  }

  function addStep() {
    setStepKeys((keys) => [...keys, newRowKey()]);
    focusAfterChange.current = { kind: "step", index: draft.steps.length };
    onChange(withNewStep(draft), names);
  }

  function closePicker() {
    returnFocusTo.current = picking;
    setPicking(null);
  }

  if (picking !== null) {
    const line = draft.lines[picking];
    return (
      <IngredientPicker
        searchIngredients={searchIngredients}
        newName={newIngredientName}
        header={
          <>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-row-title text-ink">Byt ingrediens</h3>
              <Button variant="text" onClick={closePicker} className="-mr-3">
                Avbryt
              </Button>
            </div>
            <p className="text-meta text-ink-2">Receptraden: {line.originalText}</p>
          </>
        }
        onChoose={(hit) => {
          updateLine(picking, withChosenIngredient(line, hit.id), { ...names, [hit.id]: hit.name });
          closePicker();
        }}
        onNew={(name) => {
          updateLine(picking, withNewIngredient(line, name));
          closePicker();
        }}
        onCancel={closePicker}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {onBack || draft.sourceKind === "url" || draft.sourceKind === "photo" ? (
        <div className="flex flex-col gap-1">
          {onBack ? (
            <Button variant="text" onClick={onBack} className="-ml-3 self-start">
              {backLabel}
            </Button>
          ) : null}
          {/* The source of a link or a photo; pasted text needs no reminder. */}
          {draft.sourceKind === "url" || draft.sourceKind === "photo" ? (
            <p className="text-meta text-ink-2">Källa: {sourceLabel(draft.sourceKind, draft.sourceUrl)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${ids}-title`}>Titel</FieldLabel>
        <Input
          id={`${ids}-title`}
          autoFocus
          value={draft.title}
          onChange={(event) => update({ title: event.target.value })}
          {...invalidProps(errors.title, `${ids}-title-error`)}
        />
        {errors.title ? <FieldError id={`${ids}-title-error`}>{errors.title}</FieldError> : null}
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <span id={`${ids}-servings`} className="text-body font-semibold text-ink">
            Portioner
          </span>
          <div role="group" aria-labelledby={`${ids}-servings`}>
            <Stepper value={draft.servings} onChange={(servings) => update({ servings })} className="-ml-3" />
          </div>
        </div>
        <div className="flex w-40 flex-col gap-1.5">
          <FieldLabel htmlFor={`${ids}-minutes`}>Tid i minuter</FieldLabel>
          <Input
            id={`${ids}-minutes`}
            inputMode="numeric"
            value={minutesText}
            onChange={(event) => {
              const text = event.target.value;
              setMinutesText(text);
              const minutes = parseMinutesInput(text);
              if (minutes === undefined) {
                onPendingChange({ ...pending, totalMinutes: text });
                return;
              }
              onPendingChange({ ...pending, totalMinutes: undefined });
              update({ totalMinutes: minutes });
            }}
            {...invalidProps(errors.totalMinutes, `${ids}-minutes-error`)}
          />
          {errors.totalMinutes ? <FieldError id={`${ids}-minutes-error`}>{errors.totalMinutes}</FieldError> : null}
        </div>
      </div>

      <section aria-labelledby={`${ids}-lines`} className="flex flex-col gap-1">
        <h3 ref={linesHeading} tabIndex={-1} id={`${ids}-lines`} className="text-section-label text-ink-3">
          Ingredienser
        </h3>
        <ul className="flex flex-col">
          {draft.lines.map((line, index) => (
            <LineRow
              key={lineKeys[index]}
              line={line}
              name={ingredientLabel(line, names)}
              editing={editing === lineKeys[index]}
              amountText={pending.amounts?.[index]}
              amountError={errors[`lines.${index}.amount`]}
              onToggleEdit={() => setEditing(editing === lineKeys[index] ? null : lineKeys[index])}
              onPick={() => setPicking(index)}
              onChange={(next) => updateLine(index, next)}
              onPendingAmount={(text) => setPendingAmount(index, text)}
              onRemove={() => removeLine(index)}
              ingredientRef={(element) => {
                if (element) ingredientButtons.current.set(index, element);
                else ingredientButtons.current.delete(index);
              }}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby={`${ids}-steps`} className="flex flex-col gap-3">
        <h3 id={`${ids}-steps`} className="text-section-label text-ink-3">
          Steg
        </h3>
        <ol className="flex flex-col gap-3">
          {draft.steps.map((step, index) => {
            const error = errors[`steps.${index}`];
            return (
              <li key={stepKeys[index]} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <FieldLabel htmlFor={`${ids}-step-${index}`}>Steg {index + 1}</FieldLabel>
                  <Button variant="text" onClick={() => removeStep(index)} className="-mr-3">
                    Ta bort<span className="sr-only"> steg {index + 1}</span>
                  </Button>
                </div>
                <textarea
                  id={`${ids}-step-${index}`}
                  rows={3}
                  value={stepText(step)}
                  onChange={(event) =>
                    update({
                      steps: draft.steps.map((current, i) => (i === index ? withStepText(current, event.target.value) : current)),
                    })
                  }
                  className={textareaClasses}
                  {...invalidProps(error, `${ids}-step-${index}-error`)}
                />
                {error ? <FieldError id={`${ids}-step-${index}-error`}>{error}</FieldError> : null}
              </li>
            );
          })}
        </ol>
        {draft.steps.length < draftLimits.steps ? (
          <Button ref={addStepButton} variant="text" onClick={addStep} className="-ml-3 self-start">
            Lägg till steg
          </Button>
        ) : null}
      </section>
      {end}
    </div>
  );
}

type LineRowProps = {
  line: RecipeLine;
  name: string;
  editing: boolean;
  /** Typed amount that is not a number, if any. */
  amountText: string | undefined;
  amountError: string | undefined;
  onToggleEdit: () => void;
  onPick: () => void;
  onChange: (line: RecipeLine) => void;
  onPendingAmount: (text: string | undefined) => void;
  onRemove: () => void;
  ingredientRef: (element: HTMLButtonElement | null) => void;
};

function LineRow({
  line,
  name,
  editing,
  amountText,
  amountError,
  onToggleEdit,
  onPick,
  onChange,
  onPendingAmount,
  onRemove,
  ingredientRef,
}: LineRowProps) {
  const id = useId();
  const check = needsCheck(line);
  const isNew = line.ingredient.kind === "new";
  const quantity = line.isVague ? "" : formatQuantity(line.amount, line.unit);

  return (
    <li data-testid="recipe-line" className="flex flex-col gap-2 border-b border-hairline py-2 last:border-b-0">
      <div className="flex items-start gap-2">
        {/* The ring marks an uncertain match (EXPERIENCE.md, Ingrediensrad); the badge says it in words. */}
        <span
          aria-hidden="true"
          className={
            check
              ? "mt-[11px] size-[22px] shrink-0 rounded-full border-2 border-sky-ink"
              : "mt-[11px] size-[22px] shrink-0"
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-x-2">
            {quantity ? <span className="text-body text-ink-2">{quantity}</span> : null}
            <button
              ref={ingredientRef}
              type="button"
              onClick={onPick}
              className="min-h-tap rounded-sm text-left text-body font-semibold text-ink underline decoration-ink-3 underline-offset-4"
            >
              {name}
              <span className="sr-only">, byt ingrediens</span>
            </button>
            {check || isNew ? (
              <span className="flex gap-1">
                {check ? <Badge tone="sky">Kontrollera</Badge> : null}
                {isNew ? <Badge tone="neutral">Ny</Badge> : null}
              </span>
            ) : null}
          </div>
          <p className="text-meta text-ink-2">{line.originalText}</p>
        </div>
        <Button variant="text" aria-expanded={editing} onClick={onToggleEdit} className="-mr-3">
          Ändra<span className="sr-only"> mängd för {name}</span>
        </Button>
      </div>
      {editing ? (
        <AmountEditor
          id={id}
          line={line}
          initialText={amountText}
          error={amountError}
          onChange={onChange}
          onPending={onPendingAmount}
          onRemove={onRemove}
          name={name}
        />
      ) : amountError ? (
        <FieldError className="pl-[30px]">{amountError}</FieldError>
      ) : null}
    </li>
  );
}

type AmountEditorProps = {
  id: string;
  line: RecipeLine;
  initialText: string | undefined;
  error: string | undefined;
  onChange: (line: RecipeLine) => void;
  onPending: (text: string | undefined) => void;
  onRemove: () => void;
  /** The line's ingredient, for the remove button's name. */
  name: string;
};

function AmountEditor({ id, line, initialText, error, onChange, onPending, onRemove, name }: AmountEditorProps) {
  const [text, setText] = useState(initialText ?? (line.amount === null ? "" : formatQuantity(line.amount, null)));

  return (
    <div className="flex flex-col gap-1.5 pl-[30px]">
      <div className="flex gap-3">
        <div className="flex w-28 flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-amount`}>Mängd</FieldLabel>
          <Input
            id={`${id}-amount`}
            inputMode="decimal"
            autoFocus
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              const amount = parseAmountInput(event.target.value);
              if (amount === undefined) {
                onPending(event.target.value);
                return;
              }
              onPending(undefined);
              onChange(withAmount(line, amount));
            }}
            {...invalidProps(error, `${id}-amount-error`)}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel htmlFor={`${id}-unit`}>Enhet</FieldLabel>
          <select
            id={`${id}-unit`}
            value={line.unit ?? ""}
            disabled={line.isVague}
            onChange={(event) => onChange(withUnit(line, (event.target.value || null) as Unit | null))}
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
      {error ? <FieldError id={`${id}-amount-error`}>{error}</FieldError> : null}
      <Button variant="text" onClick={onRemove} className="-ml-3 self-start">
        Ta bort raden<span className="sr-only"> {name}</span>
      </Button>
    </div>
  );
}
