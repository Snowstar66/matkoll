"use client";

import { useRouter } from "next/navigation";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Badge } from "@/components/badges";
import { Button } from "@/components/button";
import { FieldError, FieldLabel, Input } from "@/components/field";
import { Notice } from "@/components/notice";
import { Sheet } from "@/components/sheet";
import { fail, type Result } from "@/lib/errors";
import { newId } from "@/lib/new-id";
import { oneLine } from "@/lib/one-line";
import { deletePantrySite } from "../actions/delete-pantry-site";
import { savePantrySite, type SavePantrySiteState } from "../actions/save-pantry-site";
import { itemCountText } from "../domain/places";
import {
  addedSiteText,
  canRemoveSite,
  maxSites,
  type PantrySiteWithCount,
  removedSiteText,
  renamedSiteText,
  selectedSiteLabel,
  siteFieldErrors,
  siteFormSchema,
  siteLimitText,
} from "../domain/site";
import { useLiveUndo } from "./site-switching";

// Arket Boenden (FR-29, Story 8.2, EXPERIENCE.md): a row per place in the
// order they were created, with the name, the number of items and "Valt" for
// the selected place. A tap on the name gives a field for a new name; one
// name at a time. "Ta bort" is there only for an empty place that is not
// selected and not the last: it goes at once, without a question and
// without "Ångra", since nothing is lost. It waits while a confirmation with
// "Ångra" for the place's rows shows, since they could not go back to it.
// Under the list, the field "Nytt boende" and "Lägg till"; a new place is
// never selected by itself. Places are kept in the pantry, so they are
// managed in this sheet, which Matvaror and Inställningar > Boenden both open.
//
// The sheet stays open after a change, so its confirmations ("Lade till
// Stugan. …", "Boendet heter nu …", "Tog bort Stugan.") show in the sheet,
// in a live region that is always there, rather than as a toast under it.
// Errors show under the field or in a Notice at the top of the sheet. The
// list behind is read again by the actions (revalidateFor("pantry_site")),
// and by a refresh after an answer that was lost. While a name is saved, its
// field keeps focus and is read-only, and its buttons wait.

/** Stands in for the id while the name is checked as Pontus types; the id is never a field. */
const checkId = "00000000-0000-4000-8000-000000000000";

/** The field's own message for `name`, as siteFormSchema gives it, or null. */
function ownNameError(name: string): string | null {
  const checked = siteFormSchema.safeParse({ id: checkId, name, mode: "add" });
  return checked.success ? null : (siteFieldErrors(checked.error).name ?? null);
}

/** What savePantrySite answered, or `lost` when no answer came (e.g. no connection). */
type SaveAnswer = { kind: "answer"; result: SavePantrySiteState } | { kind: "lost" };

/** savePantrySite for useActionState, telling a lost answer from the others. */
async function save(previous: SavePantrySiteState, formData: FormData): Promise<SaveAnswer> {
  try {
    return { kind: "answer", result: await savePantrySite(previous, formData) };
  } catch {
    return { kind: "lost" };
  }
}

type Feedback = {
  /** A confirmation for the live region. */
  confirm: (text: string) => void;
  /** An error for the Notice at the top of the sheet. */
  showError: (text: string) => void;
};

type RenameSiteFormProps = Feedback & {
  site: PantrySiteWithCount;
  /** Saved, cancelled or gone: the row shows its name again, and focus goes to it. */
  onDone: () => void;
};

/** The field for a new name on a place's row: "Spara" saves with mode `rename`, "Avbryt" leaves the name. */
function RenameSiteForm({ site, onDone, confirm, showError }: RenameSiteFormProps) {
  const router = useRouter();
  const [name, setName] = useState(site.name);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const [, rename, saving] = useActionState<SavePantrySiteState, FormData>(async (previous, formData) => {
    const answer = await save(previous, formData);
    if (answer.kind === "lost") {
      // It may have been saved: the places are read again, and the field stays for another try.
      router.refresh();
      showError(fail("pantry_site_failed").error.message);
      return previous;
    }
    const result = answer.result;
    if (!result) return null;
    if (result.ok) {
      onDone();
      confirm(renamedSiteText(result.data.site.name));
      return result;
    }
    const { code, message, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return result;
    }
    if (fields?.name) {
      setFieldError(fields.name);
      inputRef.current?.focus();
      return result;
    }
    if (code === "pantry_site_gone") onDone();
    showError(message);
    return result;
  }, null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const own = ownNameError(name);
    if (own) {
      setFieldError(own);
      inputRef.current?.focus();
      return;
    }
    // Unchanged: nothing to save.
    if (oneLine(name) === site.name) {
      onDone();
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("id", site.id);
    formData.set("mode", "rename");
    startTransition(() => rename(formData));
  }

  const errorId = `${ids}-error`;
  return (
    <form onSubmit={submit} noValidate aria-busy={saving || undefined} className="flex w-full flex-col gap-2 py-2">
      <FieldLabel htmlFor={`${ids}-name`}>Namn</FieldLabel>
      <Input
        ref={inputRef}
        id={`${ids}-name`}
        name="name"
        autoComplete="off"
        autoFocus
        readOnly={saving}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setFieldError(null);
        }}
        aria-invalid={fieldError ? true : undefined}
        aria-describedby={fieldError ? errorId : undefined}
      />
      {fieldError ? <FieldError id={errorId}>{fieldError}</FieldError> : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="secondary" aria-disabled={saving || undefined}>
          {saving ? "Sparar …" : "Spara"}
        </Button>
        <Button
          variant="text"
          aria-disabled={saving || undefined}
          onClick={() => {
            if (!saving) onDone();
          }}
        >
          Avbryt
        </Button>
      </div>
    </form>
  );
}

type AddSiteFormProps = Feedback & {
  /** The user has maxSites places: the field and "Lägg till" are unavailable, and the reason shows first. */
  atLimit: boolean;
  /** Focus goes to the field when it mounts: after a place was added. */
  focusOnMount: boolean;
  /**
   * The id of an add whose answer was lost, until the places are read again:
   * the field keeps that id, also when the name changes, so a retry can
   * never add a second place.
   */
  pendingId: string | null;
  /** The place was added: the sheet starts a fresh field, with a new id. */
  onAdded: (name: string) => void;
  /** No answer, or one that says nothing was added: the places are read again with `id` pending. */
  onUncertain: (id: string, announce: boolean) => void;
};

/**
 * "Nytt boende" and "Lägg till", with mode `add`. The id is chosen when the
 * field mounts (when the sheet opens, and after each place added) and kept
 * until the name changes, so a retry after a lost answer adds one place.
 */
function AddSiteForm({ atLimit, focusOnMount, pendingId, onAdded, onUncertain, showError }: AddSiteFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [id, setId] = useState(() => pendingId ?? newId());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const [, add, adding] = useActionState<SavePantrySiteState, FormData>(async (previous, formData) => {
    const sent = String(formData.get("id"));
    const answer = await save(previous, formData);
    if (answer.kind === "lost") {
      showError(fail("pantry_site_failed").error.message);
      onUncertain(sent, true);
      return previous;
    }
    const result = answer.result;
    if (!result) return null;
    if (result.ok) {
      onAdded(result.data.site.name);
      return result;
    }
    const { code, message, fields } = result.error;
    if (code === "unauthorized") {
      router.refresh();
      return result;
    }
    if (fields?.name) {
      setFieldError(fields.name);
      inputRef.current?.focus();
      return result;
    }
    showError(message);
    // The id may be on a place already (a retry whose place was renamed since): it is never announced as added.
    if (code === "pantry_site_failed") onUncertain(sent, false);
    return result;
  }, null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (adding || atLimit) return;
    const own = ownNameError(name);
    if (own) {
      setFieldError(own);
      inputRef.current?.focus();
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("id", id);
    formData.set("mode", "add");
    startTransition(() => add(formData));
  }

  const limitId = `${ids}-limit`;
  const errorId = `${ids}-error`;
  const describedBy = [atLimit ? limitId : null, fieldError && !atLimit ? errorId : null].filter(Boolean).join(" ");
  return (
    <form onSubmit={submit} noValidate aria-busy={adding || undefined} className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={`${ids}-name`}>Nytt boende</FieldLabel>
      {atLimit ? (
        <p id={limitId} className="text-meta text-ink-2">
          {siteLimitText}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <Input
          ref={inputRef}
          id={`${ids}-name`}
          name="name"
          autoComplete="off"
          placeholder="Till exempel Stugan"
          disabled={atLimit}
          readOnly={adding}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldError(null);
            // A changed name is another place, with a new id (AD-20); not while an add is unknown.
            if (pendingId !== id) setId(newId());
          }}
          aria-invalid={fieldError && !atLimit ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="min-w-0 flex-[1_1_12rem]"
        />
        <Button type="submit" disabled={atLimit} aria-disabled={adding || undefined} className="shrink-0">
          {adding ? "Lägger till …" : "Lägg till"}
        </Button>
      </div>
      {fieldError && !atLimit ? <FieldError id={errorId}>{fieldError}</FieldError> : null}
    </form>
  );
}

export type SitesSheetProps = {
  open: boolean;
  onClose: () => void;
  /**
   * Increases each time the sheet opens: the sheet then starts afresh, with
   * no name being changed, an empty field "Nytt boende" and a new id.
   */
  session: number;
  /** Every place of the user's, in the order they were created, with its number of items. */
  sites: readonly PantrySiteWithCount[];
  /** The boende whose name is changed as the sheet opens (Story 16.14: "Byt namn" on a card); none by default. */
  startRenaming?: string | null;
};

/** An add whose outcome is unknown, and the places as they were when it was sent. */
type PendingAdd = { id: string; seen: readonly PantrySiteWithCount[]; announce: boolean };

/** Arket Boenden; see the comment at the top. */
export function SitesSheet({ open, onClose, session, sites, startRenaming = null }: SitesSheetProps) {
  const router = useRouter();
  const { liveUndoSites } = useLiveUndo();
  const [formSession, setFormSession] = useState(session);
  /** The place whose name is being changed; one at a time. */
  const [renaming, setRenaming] = useState<string | null>(startRenaming);
  const [status, setStatus] = useState<{ text: string; id: number } | null>(null);
  const [error, setError] = useState<{ text: string; id: number } | null>(null);
  const [removing, startRemoving] = useTransition();
  const [removingId, setRemovingId] = useState<string | null>(null);
  /** Places added in this session: the field "Nytt boende" starts afresh, with focus, after each. */
  const [added, setAdded] = useState(0);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** The rows' "Byt namn på …" buttons, by place. */
  const nameButtons = useRef(new Map<string, HTMLButtonElement>());
  /** The place whose name button takes focus once it shows again. */
  const focusRow = useRef<string | null>(null);
  const listId = useId();

  /** A confirmation; the id tells a repeated text from the one before, so it is said again. */
  function say(text: string) {
    setError(null);
    setStatus((current) => ({ text, id: (current?.id ?? 0) + 1 }));
  }

  // A new session: the sheet starts afresh (state adjusted while rendering).
  if (session !== formSession) {
    setFormSession(session);
    setRenaming(startRenaming);
    setStatus(null);
    setError(null);
    setAdded(0);
    setPendingAdd(null);
  }

  // The places as read again after an add whose outcome was unknown: the id
  // is there (it was added) or not (the field keeps it for another try).
  if (pendingAdd && sites !== pendingAdd.seen) {
    setPendingAdd(null);
    const place = sites.find((site) => site.id === pendingAdd.id);
    if (place) {
      setAdded((count) => count + 1);
      if (pendingAdd.announce) say(addedSiteText(place.name));
    }
  }

  // After a name was saved or left: focus goes back to the row's name.
  useEffect(() => {
    const id = focusRow.current;
    if (id === null) return;
    const button = nameButtons.current.get(id);
    if (!button) return;
    focusRow.current = null;
    button.focus();
  });

  const feedback: Feedback = {
    confirm: say,
    showError: (text) => {
      setStatus(null);
      setError((current) => ({ text, id: (current?.id ?? 0) + 1 }));
    },
  };

  function startRename(id: string) {
    setError(null);
    setRenaming(id);
  }

  function endRename(id: string) {
    focusRow.current = id;
    setRenaming(null);
  }

  function remove(site: PantrySiteWithCount) {
    if (removing) return;
    setError(null);
    setRemovingId(site.id);
    startRemoving(async () => {
      let result: Result<{ removed: boolean }>;
      try {
        result = await deletePantrySite({ id: site.id });
      } catch {
        result = fail("pantry_site_failed");
        router.refresh();
      }
      setRemovingId(null);
      if (result.ok) {
        // The row goes; focus stays in the sheet, on the list.
        listRef.current?.focus();
        say(removedSiteText(site.name));
        return;
      }
      if (result.error.code === "unauthorized") {
        router.refresh();
        return;
      }
      feedback.showError(result.error.message);
    });
  }

  const shownRenaming = renaming !== null && sites.some((site) => site.id === renaming) ? renaming : null;

  return (
    <Sheet open={open} onClose={onClose} title="Boenden" preventClose={removing}>
      <div className="flex flex-col gap-5">
        {error ? (
          <Notice key={error.id} role="alert">
            {error.text}
          </Notice>
        ) : null}
        <ul
          ref={listRef}
          id={listId}
          aria-label="Boenden"
          tabIndex={-1}
          className="flex flex-col rounded-lg bg-surface px-4 outline-none"
        >
          {sites.map((site) =>
            shownRenaming === site.id ? (
              <li key={site.id} data-testid="site-row" className="border-t border-hairline first:border-t-0">
                <RenameSiteForm
                  key={`${site.id}:${site.name}`}
                  site={site}
                  onDone={() => endRename(site.id)}
                  {...feedback}
                />
              </li>
            ) : (
              <li
                key={site.id}
                data-testid="site-row"
                className="flex min-h-tap flex-wrap items-center justify-between gap-x-3 border-t border-hairline py-1 first:border-t-0"
              >
                <div className="flex min-w-0 flex-col items-start">
                  <button
                    ref={(element) => {
                      if (element) nameButtons.current.set(site.id, element);
                      else nameButtons.current.delete(site.id);
                    }}
                    type="button"
                    aria-label={`Byt namn på ${site.name}`}
                    disabled={removing}
                    onClick={() => startRename(site.id)}
                    className="min-h-tap text-left text-body break-words text-ink"
                  >
                    {site.name}
                  </button>
                  <span className="flex flex-wrap items-center gap-2 pb-2 text-meta text-ink-2">
                    {site.itemCount === null ? null : itemCountText(site.itemCount)}
                    {site.isSelected ? <Badge tone="mint">{selectedSiteLabel}</Badge> : null}
                  </span>
                </div>
                {canRemoveSite(site, sites) ? (
                  <Button
                    variant="text"
                    aria-label={`Ta bort ${site.name}`}
                    disabled={removing || liveUndoSites.has(site.id)}
                    onClick={() => remove(site)}
                    className="-mr-3 shrink-0"
                  >
                    {removingId === site.id ? "Tar bort …" : "Ta bort"}
                  </Button>
                ) : null}
              </li>
            ),
          )}
        </ul>
        <AddSiteForm
          key={`${formSession}:${added}`}
          atLimit={sites.length >= maxSites}
          focusOnMount={added > 0}
          pendingId={pendingAdd?.id ?? null}
          onAdded={(name) => {
            setAdded((count) => count + 1);
            say(addedSiteText(name));
          }}
          onUncertain={(id, announce) => {
            setPendingAdd({ id, seen: sites, announce });
            router.refresh();
          }}
          {...feedback}
        />
        {/* Always there, so a screen reader hears every confirmation; only its text changes. */}
        <p role="status" aria-live="polite" aria-atomic="true" data-testid="sites-status" className="text-body text-ink">
          {status ? <span key={status.id}>{status.text}</span> : null}
        </p>
      </div>
    </Sheet>
  );
}
