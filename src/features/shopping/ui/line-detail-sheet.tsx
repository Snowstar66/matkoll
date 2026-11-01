"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { TrashIcon } from "@/components/icons";
import { FieldError, FieldLabel, Input } from "@/components/field";
import type { SearchIngredients } from "@/components/ingredient-picker";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { clearLineAmount } from "../actions/clear-line-amount";
import { setLineAmount } from "../actions/set-line-amount";
import type { ShoppingLine } from "../domain/compute-list";
import { exactAmountText, maxCustomAmountChars } from "../domain/custom-item";
import { parseLineKey } from "../domain/line-key";
import { isAmountKey, lineAmountFieldErrors, lineAmountFormSchema } from "../domain/line-override";
import { backToComputedText, computedAmountText, detailOriginsText } from "../domain/list-text";
import { canHaveProductChoice, type ProductChoiceContext, saveItemFirstText } from "../domain/product-choice";
import { CustomItemSheet } from "./custom-item-sheet";
import type { OwnChanges } from "./own-changes";
import { ProductChoiceSection } from "./product-choice-section";

// Listpostdetalj (FR-17, Story 3.6, EXPERIENCE.md): the sheet a tap on a
// line's name opens. For a recipe line it shows the amount to correct (in the
// line's unit, which never changes), where the line comes from and "Ta bort";
// a vague line and a line without a catalog ingredient have no amount to
// correct. For an own item it is the item's form (CustomItemSheet), whose
// "Spara" changes the item. A line with a catalog ingredient, and an own item,
// also has the section Produktval (Story 7.2), whose button asks the list to
// replace the detail with the sheet Produktval.

export type LineDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Increases each time the sheet opens: the form then starts from `line`. */
  session: number;
  /** The plan the list was counted for; a recipe line's changes are saved on it. `null` in a week without a plan (own items only). */
  planId: string | null;
  /** The line as it was when its name was tapped. */
  line: ShoppingLine;
  dishTitles: Readonly<Record<string, string>>;
  /** Searches the catalog for an own item's link (catalog.searchIngredients, passed down from the page, AD-1). */
  searchIngredients: SearchIngredients;
  /** "Ta bort": removes an own item or hides a recipe line, with "Ångra"; focus moves to the next line. */
  onRemove: (line: ShoppingLine, moveFocus: boolean) => void;
  /** Tracks a corrected amount, so the list's live region does not announce it as a recount. */
  onChange?: OwnChanges["track"];
  /** The selected store and its product choices, as the list was read (Story 7.2). */
  productChoices: ProductChoiceContext;
  /**
   * "Ange produktval" / "Ändra produktval": the list opens the sheet
   * Produktval for the line, which replaces this one (after "Släng
   * ändringarna?" when the detail has changes).
   */
  onProductChoice: (line: ShoppingLine) => void;
};

/** Listpostdetalj for `line`: an own item's form, or a recipe line's amount, origin and "Ta bort". */
export function LineDetailSheet(props: LineDetailSheetProps) {
  const { line, onRemove } = props;
  const parsed = parseLineKey(line.key);
  if (line.isCustom && parsed?.kind === "custom") {
    return (
      <CustomItemSheet
        open={props.open}
        onClose={props.onClose}
        session={props.session}
        searchIngredients={props.searchIngredients}
        title={line.label}
        item={{
          id: parsed.id,
          // The text as stored, not the list's name for it (never empty, single spaces).
          label: line.customLabel ?? line.label,
          ingredientId: line.ingredientId ?? null,
          linkedName: line.linkedName ?? null,
          amount: line.amount,
          unit: line.unit,
        }}
        onRemove={() => onRemove(line, true)}
        // The link as saved: a link changed in the form counts once it is saved.
        renderAfterForm={(saving, dirty) => (
          <ProductChoiceSection
            line={line}
            context={props.productChoices}
            disabled={saving}
            blockedHint={dirty ? saveItemFirstText : undefined}
            onOpen={() => props.onProductChoice(line)}
          />
        )}
      />
    );
  }
  return <RecipeLineDetail {...props} />;
}

/** What the amount field shows when the sheet opens: the line's exact amount, without its unit. */
const amountFieldText = (line: ShoppingLine) => exactAmountText(line.amount);

/** The amount the list counted for the line: beside a correction, or the line's own. */
const countedAmount = (line: ShoppingLine) => line.computedAmount ?? line.amount;

/** Equal amounts, allowing for binary noise. */
const sameAmount = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** What a save sends: a corrected amount, or back to the counted one. */
type Change = { kind: "save"; amount: string; value: number } | { kind: "clear" };

/**
 * A recipe line's detail: its name as the title, the amount field with the
 * line's unit beside it (a line with a unit only), "Beräknat: 3 dl" and
 * "Använd beräknad mängd" when the amount is corrected, what is at home in
 * other units, "Från [rätter]", the section Produktval for a line with a
 * catalog ingredient, and "Spara" and "Ta bort". "Spara" with the amount
 * unchanged only closes the sheet; with the counted amount, it takes a
 * correction off (or only closes without one). A changed amount asks
 * "Släng ändringarna?" before the sheet closes or the sheet Produktval
 * replaces it, but not before "Ta bort".
 */
function RecipeLineDetail({
  open,
  onClose,
  session,
  planId,
  line,
  dishTitles,
  onRemove,
  onChange,
  productChoices,
  onProductChoice,
}: LineDetailSheetProps) {
  const router = useRouter();
  const [formSession, setFormSession] = useState(session);
  const [amount, setAmount] = useState(() => amountFieldText(line));
  /** The form's own error shows after a save attempt, not while typing. */
  const [attempted, setAttempted] = useState(false);
  /** The server's message for the amount; cleared when it changes. */
  const [serverError, setServerError] = useState<string | null>(null);
  /** Why saving failed; a new id per failure, so the same text is announced again. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  const nextError = useRef(0);
  const amountRef = useRef<HTMLInputElement>(null);
  /** "Ta bort" has been pressed in this opening: a second press does nothing. */
  const removing = useRef(false);
  const ids = useId();

  useEffect(() => {
    if (open) removing.current = false;
  }, [open, session]);

  // A new session: the form starts from the line (state adjusted while rendering).
  if (session !== formSession) {
    setFormSession(session);
    setAmount(amountFieldText(line));
    setAttempted(false);
    setServerError(null);
    setError(null);
  }

  const correctable = isAmountKey(line.key) && !line.isVague && line.amount !== null && line.unit !== null;
  const initial = amountFieldText(line);
  const dirty = correctable && amount !== initial;

  const [, save, saving] = useActionState(async (_previous: null, change: Change) => {
    let result: Result<unknown>;
    const done = onChange?.(planId ?? "", line.key);
    try {
      result =
        change.kind === "save"
          ? await setLineAmount({ planId: planId ?? "", key: line.key, amount: change.amount, baseAmount: countedAmount(line) })
          : await clearLineAmount({ planId: planId ?? "", key: line.key });
    } catch {
      // No answer (e.g. no connection): the form stays; saving again is safe.
      result = fail("shopping_save_failed");
    }
    if (result.ok) {
      // The list behind shows the change once it is read again (the action revalidated it).
      done?.((server) => {
        const now = server.find((other) => other.key === line.key);
        if (!now) return true;
        if (change.kind === "clear") return now.computedAmount === undefined;
        return now.amount !== null && sameAmount(now.amount, change.value);
      });
      onClose();
      return null;
    }
    done?.();
    const { code, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return null;
    }
    if (fields?.amount) {
      setServerError(fields.amount);
      amountRef.current?.focus();
      return null;
    }
    nextError.current += 1;
    setError({ text: result.error.message, id: nextError.current });
    if (code === "shopping_plan_changed") router.refresh();
    return null;
  }, null);

  const parsed = lineAmountFormSchema.safeParse({ planId: planId ?? "", key: line.key, amount });
  const ownError = attempted && !parsed.success ? (lineAmountFieldErrors(parsed.error).amount ?? null) : null;
  const amountError = serverError ?? ownError;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (!dirty) {
      onClose();
      return;
    }
    if (!parsed.success) {
      // Nothing is saved; the reason shows at the field.
      setAttempted(true);
      amountRef.current?.focus();
      return;
    }
    setError(null);
    const counted = countedAmount(line);
    if (counted !== null && sameAmount(parsed.data.amount, counted)) {
      // The counted amount: a correction goes; without one there is nothing to save.
      if (line.computedAmount === undefined) onClose();
      else startTransition(() => save({ kind: "clear" }));
      return;
    }
    const value = parsed.data.amount;
    startTransition(() => save({ kind: "save", amount, value }));
  }

  function backToComputed() {
    if (saving) return;
    setError(null);
    startTransition(() => save({ kind: "clear" }));
  }

  /** "Ta bort": no question first, even with unsaved changes; the confirmation offers "Ångra". */
  function remove() {
    if (saving || removing.current) return;
    removing.current = true;
    onClose();
    onRemove(line, true);
  }

  const origins = detailOriginsText(line.origins, dishTitles);
  const formId = `${ids}-form`;
  const describedBy = amountError ? { "aria-invalid": true as const, "aria-describedby": `${ids}-amount-error` } : {};

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={line.label}
      closeLabel={correctable ? "Avbryt" : "Klar"}
      isDirty={dirty}
      preventClose={saving}
      footer={
        <>
          {error ? (
            <Notice key={error.id} role="alert">
              {error.text}
            </Notice>
          ) : null}
          {correctable ? (
            // Enabled while the amount is invalid, so a tap shows why instead of doing nothing.
            <Button type="submit" form={formId} fullWidth disabled={saving}>
              {saving ? "Sparar …" : "Spara"}
            </Button>
          ) : null}
          <div className="mt-3 border-t border-border pt-1">
            <Button variant="danger" fullWidth disabled={saving} onClick={remove}>
              <TrashIcon size={20} />
              Ta bort
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-5" inert={saving}>
        {correctable ? (
          <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={`${ids}-amount`}>Mängd</FieldLabel>
            <div className="flex items-center gap-3">
              <Input
                ref={amountRef}
                id={`${ids}-amount`}
                inputMode="decimal"
                autoComplete="off"
                maxLength={maxCustomAmountChars}
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setServerError(null);
                  setError(null);
                }}
                className="w-28"
                {...describedBy}
              />
              <span data-testid="line-detail-unit" className="text-body text-ink">
                {line.unit}
              </span>
            </div>
            {amountError ? <FieldError id={`${ids}-amount-error`}>{amountError}</FieldError> : null}
            {line.computedAmount !== undefined ? (
              <div className="flex items-center justify-between gap-3">
                <p data-testid="line-detail-computed" className="min-w-0 text-meta text-ink-2">
                  {computedAmountText(line.computedAmount, line.unit)}
                </p>
                <Button type="button" variant="text" onClick={backToComputed} disabled={saving} className="-mr-3 shrink-0">
                  {backToComputedText}
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
        {line.pantryNote || origins ? (
          <div className="flex flex-col gap-1">
            {line.pantryNote ? (
              <p data-testid="line-detail-pantry" className="text-body text-ink-2">
                ({line.pantryNote})
              </p>
            ) : null}
            {origins ? (
              <p data-testid="line-detail-origins" className="text-body text-ink-2">
                {origins}
              </p>
            ) : null}
          </div>
        ) : null}
        {canHaveProductChoice(line) ? (
          <ProductChoiceSection
            line={line}
            context={productChoices}
            disabled={saving}
            onOpen={() => onProductChoice(line)}
          />
        ) : null}
      </div>
    </Sheet>
  );
}
