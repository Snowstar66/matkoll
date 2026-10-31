"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useId,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/button";
import { FieldError, Input } from "@/components/field";
import { ListGroup } from "@/components/list-group";
import { Notice } from "@/components/notice";
import { useToast } from "@/components/toast";
import { errorMessages, fail } from "@/lib/errors";
import { addRecipeSite, type AddRecipeSiteState } from "../actions/add-recipe-site";
import {
  type RecipeSiteChange,
  type RecipeSiteChangeResult,
  setRecipeSiteActive,
} from "../actions/set-recipe-site-active";
import { compareDomains } from "../domain/domain-name";
import { removedSitesMessage } from "../domain/removed-sites";

export type RecipeSitesProps = {
  /** The active approved recipe sites, sorted with `compareDomains`. */
  sites: readonly string[];
};

function applyChange(sites: readonly string[], { domain, isActive }: RecipeSiteChange): readonly string[] {
  const others = sites.filter((site) => site !== domain);
  return isActive ? [...others, domain].sort(compareDomains) : others;
}

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
 * Godkända receptsajter (FR7): the active sites with "Ta bort" each, and a
 * field for a new one. "Ta bort" turns the site off at once and offers
 * "Ångra" for 5 s in the short confirmation; sites removed while that
 * confirmation shows join it, and "Ångra" turns them all on again. The list
 * follows optimistically until the server's list comes back, and goes back
 * when a change fails. Buttons wait for hydration, since they only work
 * through React.
 */
export function RecipeSites({ sites }: RecipeSitesProps) {
  const { showToast } = useToast();
  const hydrated = useHydrated();
  const [shownSites, changeShownSites] = useOptimistic(sites, applyChange);
  const [changeError, setChangeError] = useState<string | null>(null);
  // The sites removed under the confirmation showing now; a new object per confirmation.
  const removedBatch = useRef<{ domains: readonly string[] } | null>(null);
  const [value, setValue] = useState("");
  const [addState, addAction, adding] = useActionState<AddRecipeSiteState, FormData>(async (previous, formData) => {
    let result: AddRecipeSiteState;
    try {
      result = await addRecipeSite(previous, formData);
    } catch {
      // No answer (e.g. no connection): the typed text stays.
      return fail("settings_save_failed");
    }
    if (result?.ok) {
      setValue("");
      showToast(`Lade till ${result.data.domain}.`);
    }
    return result;
  }, null);
  const headingId = useId();
  const fieldId = useId();
  const errorId = useId();
  // The error belongs to the value it was given for; typing clears it.
  const [errorFor, setErrorFor] = useState<AddRecipeSiteState>(null);
  const fieldError =
    addState && !addState.ok && errorFor !== addState ? (addState.error.fields?.domain ?? addState.error.message) : null;

  /** Saves one change; on failure shows the notice and returns null. */
  async function save(change: RecipeSiteChange): Promise<RecipeSiteChangeResult | null> {
    try {
      const result = await setRecipeSiteActive(change);
      if (result.ok) return result.data;
      setChangeError(result.error.message);
    } catch {
      setChangeError(errorMessages.settings_save_failed);
    }
    return null;
  }

  function confirmRemoved(domain: string) {
    const domains = [...(removedBatch.current?.domains ?? []).filter((site) => site !== domain), domain];
    const batch = { domains };
    removedBatch.current = batch;
    const forget = () => {
      if (removedBatch.current === batch) removedBatch.current = null;
    };
    showToast(removedSitesMessage(domains), {
      onUndo: () => {
        forget();
        restore(domains);
      },
      onClose: forget,
    });
  }

  function remove(domain: string) {
    setChangeError(null);
    startTransition(async () => {
      changeShownSites({ domain, isActive: false });
      const done = await save({ domain, isActive: false });
      // Nothing to undo when the site was off already.
      if (done?.changed) confirmRemoved(domain);
    });
  }

  function restore(domains: readonly string[]) {
    setChangeError(null);
    startTransition(async () => {
      for (const domain of domains) changeShownSites({ domain, isActive: true });
      await Promise.all(domains.map((domain) => save({ domain, isActive: true })));
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => addAction(formData));
  }

  return (
    <section id="godkanda-receptsajter" aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="sr-only">
        Godkända receptsajter
      </h2>
      <p className="px-1 desktop:px-0 text-meta text-ink-3">Matkoll hämtar bara recept från sajterna i listan.</p>
      {changeError ? <Notice role="alert">{changeError}</Notice> : null}
      {shownSites.length > 0 ? (
        <ListGroup labelledBy={headingId}>
          {shownSites.map((domain) => (
            <li key={domain} data-testid="recipe-site" className="flex min-h-[52px] items-center justify-between gap-3 pl-4 pr-1">
              <span className="min-w-0 text-body break-all text-ink">{domain}</span>
              <button
                type="button"
                aria-label={`Ta bort ${domain}`}
                disabled={!hydrated}
                onClick={() => remove(domain)}
                className="min-h-tap min-w-tap shrink-0 rounded-md px-3 text-meta text-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Ta bort
              </button>
            </li>
          ))}
        </ListGroup>
      ) : (
        <p className="text-body text-ink-2">Inga godkända receptsajter. Lägg till en så går det att importera från länkar.</p>
      )}
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <label htmlFor={fieldId} className="px-1 desktop:px-0 text-section-label text-ink-2">
          Lägg till<span className="sr-only"> ny receptsajt</span>
        </label>
        <div className="flex gap-2">
          <Input
            id={fieldId}
            name="domain"
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="t.ex. koket.se"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setErrorFor(addState);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? errorId : undefined}
            className="min-w-0 flex-1"
          />
          <Button type="submit" disabled={adding || !hydrated} className="shrink-0">
            Lägg till
          </Button>
        </div>
        {fieldError ? (
          <FieldError id={errorId} role="alert">
            {fieldError}
          </FieldError>
        ) : null}
      </form>
    </section>
  );
}
