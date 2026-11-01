"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, type FormEvent, startTransition, useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { TrashIcon } from "@/components/icons";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import type { Store } from "@/features/settings";
import { errorMessages, fail, type Result } from "@/lib/errors";
import { removeProductChoice, type RemovedProductChoice } from "../actions/remove-product-choice";
import { restoreProductChoice } from "../actions/restore-product-choice";
import { saveProductChoice } from "../actions/save-product-choice";
import {
  packageSizePlaceholder,
  productChoiceGoneText,
  type ProductChoice,
  productChoiceFieldErrors,
  type ProductChoiceFormInput,
  productChoiceFormSchema,
  productChoiceRemovedText,
  productChoiceSavedText,
  productChoiceTitle,
  removeProductChoiceText,
} from "../domain/product-choice";

// Arket Produktval (FR-27, Story 7.2): the product Pontus buys for a catalog
// ingredient in the selected store, with its package size and an optional
// link. It replaces Listpostdetalj (sheets never stack, UX-DR4). The store is
// the one the list was read with, and its name is under the title, so the
// choice is saved for the store Pontus sees. The link is text Pontus types;
// it is never fetched.

type FormValues = { productName: string; packageSize: string; url: string };
type Field = keyof FormValues;
const fields: readonly Field[] = ["productName", "packageSize", "url"];

function valuesOf(choice: ProductChoice | null): FormValues {
  return {
    productName: choice?.productName ?? "",
    packageSize: choice?.packageSize ?? "",
    url: choice?.url ?? "",
  };
}

function isFormDirty(values: FormValues, initial: FormValues): boolean {
  return fields.some((field) => values[field] !== initial[field]);
}

/** What the sheet asks the server to do. */
type Request = { kind: "save"; input: ProductChoiceFormInput } | { kind: "remove"; id: string };

export type ProductChoiceSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Increases each time the sheet opens: the form then starts from `choice`. (The sheet stays mounted.) */
  session: number;
  /** The line's name, for "Produktval för grädde". */
  label: string;
  /** The catalog ingredient the choice is for. */
  ingredientId: string;
  /** The store the list was read with; the choice is saved for it. */
  store: Store;
  /**
   * The store's choice for the ingredient as the list has it now, or `null`.
   * The sheet starts from it when it opens, and takes it up again after a
   * save found another choice stored.
   */
  choice: ProductChoice | null;
};

/** Tells two versions of a stored choice apart: its id and when it was saved. */
const versionOf = (choice: ProductChoice | null) => (choice ? `${choice.id} ${choice.updatedAt}` : "none");

/**
 * Produkt, Förpackning ("t.ex. 5 dl") and Länk (https), "Spara" and, with a
 * choice, "Ta bort produktval"; "Avbryt" in the header. "Spara" saves with
 * saveProductChoice, closes the sheet and says "Produktvalet är sparat.";
 * the fields stay when saving fails. The save sends the choice the sheet
 * started from, and writes only when that is still the stored one: when
 * another tab saved, changed or removed a choice meanwhile, nothing is
 * written, the sheet says so and takes up the choice as it is now once the
 * list is read again. "Ta bort produktval" removes the choice without asking,
 * closes the sheet and offers "Ångra" for 5 s, which puts it back with the
 * same id; when a new choice has been saved meanwhile, "Det gick inte att
 * ångra." and the new one stays. Unsaved changes ask "Släng ändringarna?"
 * before the sheet closes; nothing closes it while it saves.
 */
export function ProductChoiceSheet({ open, onClose, session, label, ingredientId, store, choice }: ProductChoiceSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formSession, setFormSession] = useState(session);
  /** The stored choice the form started from, which a save expects to find. */
  const [base, setBase] = useState(choice);
  /** A save found another choice stored: the form takes up the list's choice once it has been read again. */
  const [awaitingChoice, setAwaitingChoice] = useState(false);
  const [initial, setInitial] = useState(() => valuesOf(choice));
  const [values, setValues] = useState(initial);
  /** Why saving or removing failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The server's messages by field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The form's own messages show after a save attempt, not while typing. */
  const [attempted, setAttempted] = useState(false);
  /** What the pending request is, for the button that shows it. */
  const [pendingKind, setPendingKind] = useState<Request["kind"]>("save");
  const nextError = useRef(0);
  const productNameRef = useRef<HTMLInputElement>(null);
  const packageSizeRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const refs = { productName: productNameRef, packageSize: packageSizeRef, url: urlRef };
  const ids = useId();

  // A new session: the form starts from the choice (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = valuesOf(choice);
    setFormSession(session);
    setBase(choice);
    setAwaitingChoice(false);
    setInitial(fresh);
    setValues(fresh);
    setError(null);
    setServerFields({});
    setAttempted(false);
  } else if (awaitingChoice && versionOf(choice) !== versionOf(base)) {
    // The list has been read again after a refused save: the form starts from the choice as it is now.
    const fresh = valuesOf(choice);
    setBase(choice);
    setAwaitingChoice(false);
    setInitial(fresh);
    setValues(fresh);
    setServerFields({});
    setAttempted(false);
  }

  function showError(text: string) {
    nextError.current += 1;
    setError({ text, id: nextError.current });
  }

  /** "Ångra" after "Ta bort produktval": puts the row back; a failure is announced as an alert. */
  async function undo(row: ProductChoice) {
    let result: Result<unknown>;
    try {
      result = await restoreProductChoice(row);
    } catch {
      result = fail("shopping_restore_failed");
    }
    if (result.ok) return;
    if (result.error.code !== "unauthorized") showToast(result.error.message, { role: "alert" });
    router.refresh();
  }

  const [, send, pending] = useActionState(async (_previous: null, request: Request) => {
    let result: Result<unknown>;
    try {
      result = request.kind === "save" ? await saveProductChoice(request.input) : await removeProductChoice({ id: request.id });
    } catch {
      // No answer (e.g. no connection): the form stays; saving again gives the same row.
      result = fail(request.kind === "save" ? "shopping_product_choice_save_failed" : "shopping_product_choice_remove_failed");
    }
    if (result.ok) {
      // The action revalidated the list, so the detail shows the choice when it opens again.
      onClose();
      if (request.kind === "save") {
        showToast(productChoiceSavedText);
        return null;
      }
      const removed = result.data as RemovedProductChoice;
      if (removed.status === "gone") {
        // Removed elsewhere already: nothing to put back, and the list catches up.
        router.refresh();
        showToast(productChoiceGoneText);
      } else {
        const { row } = removed;
        showToast(productChoiceRemovedText, row ? { onUndo: () => void undo(row) } : undefined);
      }
      return null;
    }
    const { code, message, fields: messages } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return null;
    }
    if (code === "shopping_product_choice_target_gone") {
      // The store or the ingredient is gone: there is nothing to save the choice for.
      onClose();
      router.refresh();
      showToast(message, { role: "alert" });
      return null;
    }
    if (code === "shopping_product_choice_changed") {
      // Nothing was written; the form takes up the stored choice when the list has been read again.
      setAwaitingChoice(true);
      showError(message);
      router.refresh();
      return null;
    }
    const first = messages ? fields.find((field) => messages[field]) : undefined;
    if (messages && first) {
      setServerFields(messages);
      refs[first].current?.focus();
      return null;
    }
    showError(message);
    return null;
  }, null);

  const input: ProductChoiceFormInput = {
    ingredientId,
    storeId: store.id,
    ...values,
    expected: base ? { id: base.id, updatedAt: base.updatedAt } : null,
  };
  const checked = attempted ? productChoiceFormSchema.safeParse(input) : null;
  const ownErrors = checked && !checked.success ? productChoiceFieldErrors(checked.error) : {};
  const fieldError = (field: Field) => serverFields[field] ?? ownErrors[field] ?? null;

  /** A change to any field: the last attempt's messages no longer apply. */
  const update = (changes: Partial<FormValues>) => {
    setError(null);
    setServerFields({});
    setValues((current) => ({ ...current, ...changes }));
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const check = productChoiceFormSchema.safeParse(input);
    if (!check.success) {
      // Nothing is saved; the reasons show at their fields, and focus goes to the first.
      setAttempted(true);
      const messages = productChoiceFieldErrors(check.error);
      const first = fields.find((field) => messages[field]);
      if (first) refs[first].current?.focus();
      else showError(errorMessages.validation);
      return;
    }
    setError(null);
    // An unchanged choice: nothing to save.
    if (base && !isFormDirty(values, initial)) {
      onClose();
      return;
    }
    setPendingKind("save");
    startTransition(() => send({ kind: "save", input }));
  }

  /** "Ta bort produktval": no question first, even with unsaved changes; the confirmation offers "Ångra". */
  function remove() {
    if (pending || !base) return;
    setError(null);
    setPendingKind("remove");
    const { id } = base;
    startTransition(() => send({ kind: "remove", id }));
  }

  const formId = `${ids}-form`;
  const textField = (
    field: Field,
    text: string,
    props: Partial<ComponentProps<typeof Input>> = {},
    optional = false,
  ) => {
    const message = fieldError(field);
    const errorId = `${ids}-${field}-error`;
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${ids}-${field}`} optional={optional}>
          {text}
        </FieldLabel>
        <Input
          ref={refs[field]}
          id={`${ids}-${field}`}
          name={field}
          autoComplete="off"
          value={values[field]}
          onChange={(event) => update({ [field]: event.target.value } as Partial<FormValues>)}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
          {...props}
        />
        {message ? <FieldError id={errorId}>{message}</FieldError> : null}
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={productChoiceTitle(label)}
      subtitle={store.name}
      closeLabel="Avbryt"
      isDirty={isFormDirty(values, initial)}
      preventClose={pending}
      footer={
        <>
          {error ? (
            <Notice key={error.id} role="alert">
              {error.text}
            </Notice>
          ) : null}
          {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
          <Button type="submit" form={formId} fullWidth disabled={pending}>
            {pending && pendingKind === "save" ? "Sparar …" : "Spara"}
          </Button>
          {base ? (
            <Button variant="danger" fullWidth disabled={pending} onClick={remove}>
              <TrashIcon size={20} />
              {removeProductChoiceText}
            </Button>
          ) : null}
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate inert={pending} className="flex flex-col gap-5">
        {textField("productName", "Produkt")}
        {textField(
          "packageSize",
          "Förpackning",
          { placeholder: packageSizePlaceholder },
          true,
        )}
        {textField(
          "url",
          "Länk",
          {
            type: "url",
            inputMode: "url",
            autoCapitalize: "none",
            autoCorrect: "off",
            spellCheck: false,
            placeholder: "https://",
          },
          true,
        )}
      </form>
    </Sheet>
  );
}
