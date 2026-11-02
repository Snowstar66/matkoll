"use client";

import { type FormEvent, startTransition, useActionState, useId, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/button";
import { useConfirmDelete } from "@/components/confirm-delete";
import { FieldError, Input } from "@/components/field";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { focusAfterRemoval, TrashButton } from "@/components/trash-button";
import { errorMessages, fail } from "@/lib/errors";
import { addStaple, removeStaple, resetStaples, restoreStaple, type AddStapleState } from "../actions/staples";
import { addedStapleText, removedStapleText, stapleLimitText, type Staple } from "../domain/staples";

export type StaplesSettingsProps = {
  /** The household's staples, sorted (pantry.listStaples): always first, then by name. */
  staples: readonly Staple[];
};

const noSubscription = () => () => {};

/** False during server rendering and before hydration, true once React runs in the browser. */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * Inställningar → Basvaror (Pontus 2026-11-02): what the household always has
 * at home, as rows with their limit ("alltid", "upp till 1 dl") and a bin
 * each; the bin removes at once and offers "Ångra". Under them "Lägg till"
 * with the name and an optional "Upp till", and last "Återställ standard",
 * which asks first. Every change applies to the whole household at once.
 */
export function StaplesSettings({ staples }: StaplesSettingsProps) {
  const { showToast } = useToast();
  const hydrated = useHydrated();
  const { requestDelete, dialog } = useConfirmDelete();
  // Removed here and not yet gone from the server's list.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [changeError, setChangeError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const headingId = useId();
  const nameId = useId();
  const limitId = useId();
  const nameErrorId = useId();
  const limitErrorId = useId();
  const [addState, addAction, adding] = useActionState<AddStapleState, FormData>(async (previous, formData) => {
    let result: AddStapleState;
    try {
      result = await addStaple(previous, formData);
    } catch {
      // No answer (e.g. no connection): what was typed stays.
      return fail("staples_save_failed");
    }
    if (result?.ok) {
      setName("");
      setLimit("");
      showToast(addedStapleText(result.data.staple.name));
    }
    return result;
  }, null);
  // The error belongs to the values it was given for; typing clears it.
  const [errorFor, setErrorFor] = useState<AddStapleState>(null);
  const current = addState && !addState.ok && errorFor !== addState ? addState.error : null;
  const nameError = current && !current.fields?.limit ? (current.fields?.name ?? current.message) : null;
  const limitError = current?.fields?.limit ?? null;
  const shown = staples.filter((staple) => !hidden.has(staple.id));

  function hide(id: string, hiddenNow: boolean) {
    setHidden((before) => {
      const next = new Set(before);
      if (hiddenNow) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function remove(staple: Staple, bin: HTMLButtonElement) {
    setChangeError(null);
    focusAfterRemoval(bin);
    hide(staple.id, true);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof removeStaple>>;
      try {
        result = await removeStaple(staple.id);
      } catch {
        result = fail("staples_save_failed");
      }
      if (!result.ok) {
        hide(staple.id, false);
        setChangeError(result.error.message);
        return;
      }
      if (!result.data) return;
      showToast(removedStapleText(staple.name), { onUndo: () => restore(staple) });
    });
  }

  function restore(staple: Staple) {
    setChangeError(null);
    startTransition(async () => {
      try {
        const result = await restoreStaple({ name: staple.name, maxAmount: staple.maxAmount, maxUnit: staple.maxUnit });
        if (!result.ok) setChangeError(result.error.message);
      } catch {
        setChangeError(errorMessages.staples_save_failed);
      }
    });
  }

  function reset() {
    requestDelete({
      question: "Återställ standardlistan?",
      detail: "Basvarorna blir som från början: vatten, salt, peppar och vanliga kryddor, och socker, mjöl, smör och olja i små mängder. Det ni lagt till själva försvinner.",
      confirmLabel: "Återställ",
      onConfirm: async () => {
        setChangeError(null);
        try {
          const result = await resetStaples();
          if (!result.ok) {
            setChangeError(result.error.message);
            return;
          }
          setHidden(new Set());
          showToast("Basvarorna är som från början.");
        } catch {
          setChangeError(errorMessages.staples_save_failed);
        }
      },
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => addAction(formData));
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4" data-testid="staples-settings">
      <h2 id={headingId} className="sr-only">
        Basvaror
      </h2>
      <p className="px-1 desktop:px-0 text-meta text-ink-3">
        Det ni alltid har hemma. Basvaror hamnar inte på inköpslistan och räknas aldrig som något ett recept
        saknar. Med en gräns räknas bara små mängder, så 5 dl mjöl till en kaka hamnar på listan som vanligt.
      </p>
      {changeError ? <Notice role="alert">{changeError}</Notice> : null}
      {shown.length > 0 ? (
        <ListGroup labelledBy={headingId}>
          {shown.map((staple) => (
            <li key={staple.id} data-testid="staple" className="flex min-h-[52px] items-center justify-between gap-3 pl-4 pr-1">
              <span className="flex min-w-0 flex-col py-1.5">
                <span className="text-body text-ink">{staple.name}</span>
                <span className="text-meta text-ink-3">{stapleLimitText(staple)}</span>
              </span>
              <TrashButton
                label={`Ta bort ${staple.name}`}
                disabled={!hydrated}
                onPress={(bin) => remove(staple, bin)}
              />
            </li>
          ))}
        </ListGroup>
      ) : (
        <p className="px-1 desktop:px-0 text-body text-ink-2">
          Inga basvaror. Allt recepten behöver räknas med på inköpslistan.
        </p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <span className="px-1 desktop:px-0 text-section-label text-ink-2">
          Lägg till<span className="sr-only"> basvara</span>
        </span>
        <div className="flex flex-col gap-2 desktop:flex-row">
          <label htmlFor={nameId} className="sr-only">
            Namn
          </label>
          <Input
            id={nameId}
            name="name"
            type="text"
            autoComplete="off"
            placeholder="t.ex. Kardemumma"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setErrorFor(addState);
            }}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            className="w-full min-w-0 desktop:w-auto desktop:flex-1"
          />
          <div className="flex gap-2">
            <label htmlFor={limitId} className="sr-only">
              Upp till, tomt för alltid
            </label>
            <Input
              id={limitId}
              name="limit"
              type="text"
              autoComplete="off"
              placeholder="Upp till, t.ex. 1 dl"
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
                setErrorFor(addState);
              }}
              aria-invalid={limitError ? true : undefined}
              aria-describedby={limitError ? limitErrorId : undefined}
              className="min-w-0 flex-1 desktop:w-44 desktop:flex-none"
            />
            <Button type="submit" disabled={adding || !hydrated} className="shrink-0">
              Lägg till
            </Button>
          </div>
        </div>
        {nameError ? (
          <FieldError id={nameErrorId} role="alert">
            {nameError}
          </FieldError>
        ) : null}
        {limitError ? (
          <FieldError id={limitErrorId} role="alert">
            {limitError}
          </FieldError>
        ) : null}
        <p className="px-1 desktop:px-0 text-meta text-ink-3">Lämna &quot;Upp till&quot; tomt om den alltid finns hemma.</p>
      </form>
      <div>
        <Button variant="text" onClick={reset} disabled={!hydrated} data-testid="staples-reset">
          Återställ standard
        </Button>
      </div>
      {dialog}
    </section>
  );
}
