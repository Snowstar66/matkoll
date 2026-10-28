"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps, type FormEvent, startTransition, useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input, inputClasses } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { useToast } from "@/components/toast";
import { errorMessages, fail } from "@/lib/errors";
import { saveStore, type SaveStoreState } from "../actions/save-store";
import { offerSiteFor, offersLinkChainText, offersLinkHint, offersLinkLabel } from "../domain/offers-link";
import {
  changeChainHint,
  newStoreId,
  readStoreForm,
  type Store,
  STORE_CHAINS,
  type StoreChain,
  storeFieldErrors,
  storeFormSchema,
} from "../domain/store";

// Ny butik and Ändra butik (FR-28, Story 7.1): the sheet with a store's
// name, chain, store id, address and URL. A new store also has "Använd för
// varukorgen", ticked from the start, since that is usually why a store is
// added. The URL is text Pontus types; it is never fetched.

type FormValues = {
  name: string;
  chain: StoreChain;
  externalStoreId: string;
  address: string;
  url: string;
  offersUrl: string;
  makeSelected: boolean;
};

type Field = "name" | "externalStoreId" | "address" | "url" | "offersUrl";
const textFields: readonly Field[] = ["name", "externalStoreId", "address", "url", "offersUrl"];

/** Stands in for the id while the fields are checked as Pontus types; the id is never a field. */
const checkId = "00000000-0000-4000-8000-000000000000";

function valuesOf(store: Store | undefined): FormValues {
  if (!store) {
    return { name: "", chain: "ICA", externalStoreId: "", address: "", url: "", offersUrl: "", makeSelected: true };
  }
  return {
    name: store.name,
    chain: store.chain,
    externalStoreId: store.externalStoreId ?? "",
    address: store.address ?? "",
    url: store.url ?? "",
    offersUrl: store.offersUrl ?? "",
    makeSelected: false,
  };
}

function isFormDirty(values: FormValues, initial: FormValues): boolean {
  return (Object.keys(values) as (keyof FormValues)[]).some((key) => values[key] !== initial[key]);
}

/** The first field, in the form's order, with a message. */
function firstField(messages: Record<string, string>): Field | undefined {
  return textFields.find((field) => messages[field]);
}

export type StoreSheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Increases each time the sheet opens: the form then starts from `store`,
   * or empty for a new store. (The sheet stays mounted.)
   */
  session: number;
  /** The store to change; without it, the sheet adds a new store. */
  store?: Store;
  /** After a save, with the store as saved; the sheet has closed. */
  onSaved: (store: Store) => void;
};

/**
 * Arket Ny butik / Ändra butik: Namn, Kedja (STORE_CHAINS), Butiks-id,
 * Adress and URL, and "Använd för varukorgen" for a new store. "Spara"
 * saves with saveStore and closes the sheet; the section behind is read
 * again. A new store's id is chosen in the client and kept for the whole
 * opening, also when a field changes: save_store adds or changes by id, so
 * trying again after a lost answer, changed or not, saves one store. Ändra
 * butik saves with mode `change`, so a store that is gone elsewhere is never
 * added back. Unsaved changes ask "Släng ändringarna?" before the sheet
 * closes.
 */
export function StoreSheet({ open, onClose, session, store, onSaved }: StoreSheetProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formSession, setFormSession] = useState(session);
  const [initial, setInitial] = useState(() => valuesOf(store));
  const [values, setValues] = useState(initial);
  /** A new store's id, from the first "Spara" to the end of the opening. */
  const [newId, setNewId] = useState<string | null>(null);
  /** Why saving failed; the form stays as it was. Cleared when a field changes. */
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  /** The server's messages by field. Cleared when a field changes. */
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  /** The form's own messages show after a save attempt, not while typing. */
  const [attempted, setAttempted] = useState(false);
  const nextError = useRef(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const externalStoreIdRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const offersUrlRef = useRef<HTMLInputElement>(null);
  const refs = { name: nameRef, externalStoreId: externalStoreIdRef, address: addressRef, url: urlRef, offersUrl: offersUrlRef };
  const ids = useId();
  const editing = store !== undefined;

  // A new session: the form starts from the store, or empty (state adjusted while rendering).
  if (session !== formSession) {
    const fresh = valuesOf(store);
    setFormSession(session);
    setInitial(fresh);
    setValues(fresh);
    setNewId(null);
    setError(null);
    setServerFields({});
    setAttempted(false);
  }

  function showError(text: string) {
    nextError.current += 1;
    setError({ text, id: nextError.current });
  }

  const [, save, saving] = useActionState<SaveStoreState, FormData>(async (previous, formData) => {
    let result: SaveStoreState;
    try {
      result = await saveStore(previous, formData);
    } catch {
      // No answer (e.g. no connection): the form stays, with the same id for the next try.
      result = fail("settings_save_failed");
    }
    if (!result) return null;
    if (result.ok) {
      // The action revalidated Inställningar, so the section behind shows the store as saved.
      onClose();
      onSaved(result.data.store);
      return result;
    }
    const { code, message, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return result;
    }
    if (code === "settings_store_gone") {
      onClose();
      router.refresh();
      showToast(message, { role: "alert" });
      return result;
    }
    const first = fields ? firstField(fields) : undefined;
    if (fields && first) {
      setServerFields(fields);
      refs[first].current?.focus();
      return result;
    }
    showError(message);
    // A lock or a selection that met another: the stores are read again.
    if (code === "settings_save_failed") router.refresh();
    return result;
  }, null);

  const checked = attempted ? storeFormSchema.safeParse({ ...values, id: checkId, mode: "add" }) : null;
  const ownErrors = checked && !checked.success ? storeFieldErrors(checked.error) : {};
  const fieldError = (field: Field) => serverFields[field] ?? ownErrors[field] ?? null;

  /** A change to any field: the last save's messages no longer apply. The id stays. */
  const update = (changes: Partial<FormValues>) => {
    setError(null);
    setServerFields({});
    setValues((current) => ({ ...current, ...changes }));
  };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const formData = new FormData(event.currentTarget);
    // One id per opening: a retry after a lost answer saves the store once (AD-20).
    const id = store?.id ?? newId ?? newStoreId();
    if (!editing && !newId) setNewId(id);
    formData.set("id", id);
    formData.set("mode", editing ? "change" : "add");
    const check = storeFormSchema.safeParse(readStoreForm(formData));
    if (!check.success) {
      // Nothing is saved; the reasons show at their fields, and focus goes to the first.
      setAttempted(true);
      const first = firstField(storeFieldErrors(check.error));
      if (first) refs[first].current?.focus();
      else showError(errorMessages.validation);
      return;
    }
    setError(null);
    // Unchanged: nothing to save.
    if (editing && !isFormDirty(values, initial)) {
      onClose();
      return;
    }
    startTransition(() => save(formData));
  }

  const formId = `${ids}-form`;
  const textField = (field: Field, label: string, props: Partial<ComponentProps<typeof Input>> = {}, hint?: string) => {
    const message = fieldError(field);
    const errorId = `${ids}-${field}-error`;
    const hintId = `${ids}-${field}-hint`;
    const describedBy = [hint ? hintId : null, message ? errorId : null].filter(Boolean).join(" ");
    return (
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={`${ids}-${field}`}>{label}</FieldLabel>
        <Input
          ref={refs[field]}
          id={`${ids}-${field}`}
          name={field}
          autoComplete="off"
          value={values[field]}
          onChange={(event) => update({ [field]: event.target.value } as Partial<FormValues>)}
          aria-invalid={message ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...props}
        />
        {hint ? (
          <p id={hintId} className="text-meta text-ink-2">
            {hint}
          </p>
        ) : null}
        {message ? <FieldError id={errorId}>{message}</FieldError> : null}
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? "Ändra butik" : "Ny butik"}
      closeLabel="Avbryt"
      isDirty={isFormDirty(values, initial)}
      preventClose={saving}
      footer={
        <>
          {error ? (
            <Notice key={error.id} role="alert">
              {error.text}
            </Notice>
          ) : null}
          {/* Enabled while the form is invalid, so a tap shows why instead of doing nothing. */}
          <Button type="submit" form={formId} fullWidth disabled={saving}>
            {saving ? "Sparar …" : "Spara"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate inert={saving} className="flex flex-col gap-5">
        {textField("name", "Namn")}
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor={`${ids}-chain`}>Kedja</FieldLabel>
          <select
            id={`${ids}-chain`}
            name="chain"
            value={values.chain}
            onChange={(event) => update({ chain: event.target.value as StoreChain })}
            aria-describedby={editing ? `${ids}-chain-hint` : undefined}
            className={inputClasses}
          >
            {STORE_CHAINS.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
          {editing ? (
            <p id={`${ids}-chain-hint`} className="text-meta text-ink-2">
              {changeChainHint}
            </p>
          ) : null}
        </div>
        {textField("externalStoreId", "Butiks-id", { spellCheck: false })}
        {textField("address", "Adress")}
        {textField("url", "URL", {
          type: "url",
          inputMode: "url",
          autoCapitalize: "none",
          autoCorrect: "off",
          spellCheck: false,
          placeholder: "https://",
        })}
        {/* The link to the weekly offers (Story 9.1): only for a chain with an offer site. */}
        {offerSiteFor(values.chain)
          ? textField(
              "offersUrl",
              offersLinkLabel,
              {
                type: "url",
                inputMode: "url",
                autoCapitalize: "none",
                autoCorrect: "off",
                spellCheck: false,
                placeholder: "https://www.ica.se/erbjudanden/…",
              },
              offersLinkHint,
            )
          : (
            <div className="flex flex-col gap-1.5">
              <p className="text-body text-ink">{offersLinkLabel}</p>
              <p data-testid="offers-link-chain" className="text-meta text-ink-2">
                {offersLinkChainText}
              </p>
            </div>
          )}
        {editing ? null : (
          <label className="flex min-h-tap items-center gap-3 text-body text-ink">
            <input
              type="checkbox"
              name="makeSelected"
              value="true"
              checked={values.makeSelected}
              onChange={(event) => update({ makeSelected: event.target.checked })}
              className="size-5 shrink-0 accent-accent"
            />
            Använd för varukorgen
          </label>
        )}
      </form>
    </Sheet>
  );
}
