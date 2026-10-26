"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useToast } from "@/components/toast";
import type { Location } from "@/features/catalog";
import { fail, type AppError, type ErrorCode, type Result } from "@/lib/errors";
import { newId } from "@/lib/new-id";
import { confirmPantryInventory, type ConfirmedInventory } from "../actions/confirm-pantry-inventory";
import { confirmPantrySuggestions } from "../actions/confirm-pantry-suggestions";
import { restorePantryRemoval } from "../actions/restore-pantry-removal";
import type { PantryItemForm } from "../domain/pantry-item-form";
import {
  changesLeftText,
  confirmItemFromForm,
  confirmItemFromSuggestion,
  isBulkConfirmable,
  isConfirmable,
  uncertainLeftText,
  withConfirmedStock,
  type AnalyzeResult,
  type ConfirmItemInput,
  type InventoryConfirmInput,
  type PantrySuggestion,
  undoRemovalLabel,
} from "../domain/pantry-suggestion";
import { groupSuggestions, inventoryRequest, type InventoryRequest, type MissingItem } from "../domain/place-inventory";
import {
  alreadyRemovedText,
  confirmedItemsText,
  inventoryAppliedText,
  keptItemText,
  notRestoredText,
  rejectedItemText,
  removedItemsText,
  savedItemText,
} from "../domain/places";
import { focusIsFree, type PantryAnalysis, usePantryAnalysis } from "./use-pantry-analysis";

// Lagerförslag for Hemma (FR-24, FR-25): one analysis state for the page,
// shared by the camera button (PantryCamera), the section
// (PantrySuggestionList) and the sheet Lagervara. The provider sits above the
// <Suspense> keyed on the location and has no key of its own, so the
// suggestions stay when another location card is chosen, and go when Hemma
// is left or reloaded.
//
// Nothing becomes a pantry item without a tap (FR-25): Bekräfta, "Bekräfta
// alla" and the sheet's "Bekräfta" each save at once, one call at a time,
// and take the saved suggestions out. Avvisa takes one out here alone, with
// "Ångra" in the short confirmation, and never reaches the server. A photo of
// an empty place (or one that could not be read) saves through
// confirmPantrySuggestions (Story 6.2); a photo compared with its place
// (Story 6.4) through confirmPantryInventory, which also replaces other
// units ("Ändrat") and removes what is no longer seen ("Ta bort", and
// "Bekräfta alla" with every "Syns inte längre" card left). Removals keep
// their rows on the server under an operation id, and the short
// confirmation's "Ångra" puts them back by it (restorePantryRemoval);
// removals while that confirmation shows join it. "Behåll" takes a "Syns
// inte längre" card out here alone, like Avvisa. Focus after a change is
// moved from here, so a list or camera button mounted anew under another
// location card still gets a move that was asked for while they were away.

/** How long a confirmation may take before it counts as failed, so the buttons work again. */
export const confirmTimeoutMs = 30_000;

/** Where focus goes once the section has changed: a card's first button, "Bekräfta alla", or the camera button. */
export type SuggestionFocus = { kind: "confirm"; id: string } | { kind: "confirmAll" } | { kind: "camera" };

/** How the sheet's "Bekräfta" for a suggestion ended. */
export type CorrectOutcome =
  /** Saved; `onSaved` closed the sheet as the card went. */
  | { kind: "saved" }
  /** Saved, but the suggestions were replaced meanwhile: no card to take out. */
  | { kind: "savedStale" }
  | { kind: "failed"; error: AppError }
  /** The suggestion is no longer there (a newer photo replaced it): nothing was sent. */
  | { kind: "gone" }
  /** Another confirmation is being saved: nothing was sent. */
  | { kind: "busy" };

/** How Avvisa ended: taken out, no longer there, or not now (a confirmation is being saved). */
export type RejectOutcome = "rejected" | "gone" | "busy";

export type PantryReview = {
  /** A confirmation is being saved: every suggestion button is disabled. */
  saving: boolean;
  /** The suggestions (and "Syns inte längre" items) being saved, whose cards say "Sparar …". */
  savingIds: ReadonlySet<string>;
  /** The call being saved is "Bekräfta alla". */
  savingAll: boolean;
  /** Why the last confirmation failed; the suggestions stay. */
  confirmError: AppError | null;
  /** The suggestions that cannot be confirmed as they are (checked here, or refused by the server): "Bekräfta alla" leaves them out. */
  invalidIds: ReadonlySet<string>;
  /**
   * Bekräfta (one id) or "Bekräfta alla" (`all`): saves the suggestions as
   * they are; for a compared photo, `all` also removes every "Syns inte
   * längre" item left.
   */
  confirm: (ids: readonly string[], options?: { all?: boolean }) => void;
  /**
   * The sheet's "Bekräfta" for a corrected suggestion of `generation`.
   * `onSaved` runs just before the card goes, in the same update, so the
   * sheet closes before focus moves on to the next card.
   */
  confirmCorrected: (
    id: string,
    generation: number,
    form: PantryItemForm,
    onSaved: () => void,
  ) => Promise<CorrectOutcome>;
  /** Avvisa: takes the suggestion out, with "Ångra"; `generation` defaults to the current one. */
  reject: (id: string, generation?: number) => RejectOutcome;
  /** "Ta bort" on a "Syns inte längre" card: removes its rows at once, with "Ångra". */
  removeMissing: (id: string) => void;
  /** "Behåll" on a "Syns inte längre" card: takes it out without writing, with "Ångra". */
  keepMissing: (id: string) => void;
  /** A ref callback for a card's first button (Bekräfta, or "Ta bort"), so focus can be moved to it. */
  confirmButtonRef: (id: string) => (button: HTMLButtonElement) => () => void;
  /** "Bekräfta alla". */
  confirmAllRef: RefObject<HTMLButtonElement | null>;
  /**
   * Moves focus asked for while the list or camera button was away (for
   * their mount, only while focus is free), or while a sheet was showing
   * (`afterSheet`, called once the photo's sheet has closed and given focus back).
   */
  flushFocus: (options?: { afterSheet?: boolean }) => void;
};

export type PantrySuggestions = PantryAnalysis & PantryReview;

const PantrySuggestionsContext = createContext<PantrySuggestions | null>(null);

/**
 * Where focus goes when `id` leaves the cards and `gone` with it: the next
 * card's first button, else the previous card's, else the camera button.
 * `cards` are in the order Hemma shows them.
 */
export function focusAfter(cards: readonly { id: string }[], id: string, gone: ReadonlySet<string>): SuggestionFocus {
  const index = cards.findIndex((card) => card.id === id);
  const stays = (card: { id: string }) => !gone.has(card.id);
  const next = cards.slice(index + 1).find(stays) ?? cards.slice(0, Math.max(index, 0)).reverse().find(stays);
  return next ? { kind: "confirm", id: next.id } : { kind: "camera" };
}

/**
 * Puts a rejected card back after the one that was before it, else before
 * the one that was after it, else where it was, as far as the list reaches
 * now.
 */
export function putBack<T extends { id: string }>(
  cards: readonly T[],
  card: T,
  neighbours: { before: string | null; after: string | null; index: number },
): T[] {
  if (cards.some((other) => other.id === card.id)) return [...cards];
  const position = (id: string | null) => (id === null ? -1 : cards.findIndex((other) => other.id === id));
  let at: number;
  if (neighbours.before === null) at = 0;
  else if (position(neighbours.before) >= 0) at = position(neighbours.before) + 1;
  else if (position(neighbours.after) >= 0) at = position(neighbours.after);
  else at = Math.min(neighbours.index, cards.length);
  return [...cards.slice(0, at), card, ...cards.slice(at)];
}

/** The cards in the order Hemma shows them: Nytt, Ändrat and Syns inte längre, or the plain list. */
export function visibleCards(result: AnalyzeResult): { id: string }[] {
  const { added, changed, missing } = groupSuggestions(result);
  return [...added, ...changed, ...missing];
}

/** Holds the camera's analysis and its suggestions for Hemma. Put it above PantrySheetProvider; needs a ToastProvider above. */
export function PantrySuggestionsProvider({ children }: { children: ReactNode }) {
  const analysis = usePantryAnalysis();
  const review = usePantryReview(analysis);
  return (
    <PantrySuggestionsContext.Provider value={{ ...analysis, ...review }}>{children}</PantrySuggestionsContext.Provider>
  );
}

/** The analysis, its suggestions and their review; needs a PantrySuggestionsProvider above. */
export function usePantrySuggestions(): PantrySuggestions {
  const suggestions = useContext(PantrySuggestionsContext);
  if (!suggestions) throw new Error("usePantrySuggestions needs a PantrySuggestionsProvider");
  return suggestions;
}

type Pending = { ids: ReadonlySet<string>; all: boolean };
/** Suggestions the server refused, for one generation of suggestions. */
type Refused = { generation: number; ids: ReadonlySet<string> };

/** A call's answer, or `code` with `lost` when there is none within confirmTimeoutMs or the call fails. */
async function within<T>(call: () => Promise<Result<T>>, code: ErrorCode): Promise<{ result: Result<T>; lost: boolean }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ result: Result<T>; lost: boolean }>((resolve) => {
    timer = setTimeout(() => resolve({ result: fail(code), lost: true }), confirmTimeoutMs);
  });
  try {
    return await Promise.race([call().then((result) => ({ result, lost: false })), timeout]);
  } catch {
    // No answer (e.g. no connection): the suggestions stay.
    return { result: fail(code), lost: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The removals the short confirmation showing now puts back with "Ångra":
 * the server keeps their rows under `id`, and later removals while it shows
 * send the same id.
 */
type RemovalBatch = {
  id: string;
  location: Location;
  /** The suggestions' generation the removals were made in: "Ångra" puts their cards back only while it is current. */
  generation: number;
  /** The removed "Syns inte längre" items, for the confirmation and for their cards after "Ångra". */
  items: readonly MissingItem[];
  /** How many rows the server keeps under `id`. */
  undoable: number;
};

/** A "Syns inte längre" item back in the list after "Ångra", in the list's order (by name, Swedish). */
function withMissing(missing: readonly MissingItem[], back: readonly MissingItem[]): MissingItem[] {
  const ids = new Set(missing.map((item) => item.id));
  return [...missing, ...back.filter((item) => !ids.has(item.id))].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

function usePantryReview(analysis: PantryAnalysis): PantryReview {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<{ error: AppError; generation: number } | null>(null);
  const [refused, setRefused] = useState<Refused | null>(null);
  /** `refused` as it is now, for the confirmation that reads it after a save. */
  const refusedNow = useRef<Refused | null>(null);
  /** One call at a time: a double tap never saves the same suggestion twice. */
  const busy = useRef(false);
  /** "Ångra" tapped while a confirmation was being saved: done once it has answered. */
  const deferred = useRef<(() => void)[]>([]);
  /** The removals whose confirmation with "Ångra" shows now. */
  const batch = useRef<RemovalBatch | null>(null);
  /**
   * The new operation id of a removal that failed or got no answer: the next
   * removal in the same place sends it again, so "Ångra" still finds rows it
   * may have removed. Never the id of a confirmation that has closed.
   */
  const spareOperation = useRef<{ id: string; location: Location } | null>(null);
  const { cameraButtonRef } = analysis;
  const confirmButtons = useRef(new Map<string, HTMLButtonElement>());
  const confirmAllRef = useRef<HTMLButtonElement | null>(null);
  /** Where focus should go, until it has gone there. */
  const focusTarget = useRef<SuggestionFocus | null>(null);
  const [focusRequests, setFocusRequests] = useState(0);

  const requestFocus = (target: SuggestionFocus) => {
    focusTarget.current = target;
    setFocusRequests((count) => count + 1);
  };

  /**
   * Moves focus to the target, or the camera button when the target is gone;
   * waits while neither is there, and while a modal sheet shows (everything
   * behind it is inert, so the move would be lost).
   */
  const applyFocus = useCallback(() => {
    const target = focusTarget.current;
    if (!target || document.querySelector("dialog[open]")) return;
    const button =
      target.kind === "confirm"
        ? confirmButtons.current.get(target.id)
        : target.kind === "confirmAll"
          ? confirmAllRef.current
          : null;
    const element = button ?? cameraButtonRef.current;
    if (!element) return;
    focusTarget.current = null;
    element.focus();
  }, [cameraButtonRef]);

  // After the commit that changed the section (and closed the sheet, whose own focus return runs first).
  useEffect(() => {
    if (focusRequests > 0) applyFocus();
  }, [focusRequests, applyFocus]);

  const flushFocus = useCallback(
    (options?: { afterSheet?: boolean }) => {
      if (focusTarget.current && (options?.afterSheet || focusIsFree(null))) applyFocus();
    },
    [applyFocus],
  );

  const confirmButtonRef = useCallback(
    (id: string) => (button: HTMLButtonElement) => {
      confirmButtons.current.set(id, button);
      return () => {
        if (confirmButtons.current.get(id) === button) confirmButtons.current.delete(id);
      };
    },
    [],
  );

  const isRefused = (generation: number, id: string) =>
    refusedNow.current?.generation === generation && refusedNow.current.ids.has(id);

  function refuse(generation: number, ids: readonly string[]) {
    const earlier = refusedNow.current?.generation === generation ? refusedNow.current.ids : new Set<string>();
    const next = { generation, ids: new Set([...earlier, ...ids]) };
    refusedNow.current = next;
    setRefused(next);
  }

  /** Runs `call` for the cards `ids`; `unauthorized` reads the page again, which sends Pontus to sign in. */
  async function save<T>(
    ids: readonly string[],
    all: boolean,
    call: () => Promise<Result<T>>,
    code: ErrorCode,
  ): Promise<{ result: Result<T>; lost: boolean }> {
    busy.current = true;
    setPending({ ids: new Set(ids), all });
    setError(null);
    const answer = await within(call, code);
    busy.current = false;
    setPending(null);
    if (!answer.result.ok && answer.result.error.code === "unauthorized") router.refresh();
    return answer;
  }

  /** The "Ångra" that waited for a confirmation. */
  function runDeferred() {
    const waiting = deferred.current;
    deferred.current = [];
    for (const undo of waiting) undo();
  }

  /**
   * Takes the saved suggestions and "Syns inte längre" items out, updates "I
   * kylen nu" on the rest, and moves focus on from `from` (or to the camera
   * button).
   */
  function takeOut(
    generation: number,
    ids: readonly string[],
    /** The card focus moves on from, a card to focus, or `null` for the camera button. */
    from: string | SuggestionFocus | null,
    items: readonly ConfirmItemInput[],
    setIngredientIds: readonly string[] = [],
  ) {
    const result = analysis.latestResult(generation);
    if (!result) return;
    // An ingredient just set in the place is no longer "Syns inte längre", so nothing later removes the row it got.
    const set = new Set(setIngredientIds);
    const confirmedMissing = groupSuggestions(result)
      .missing.filter((item) => set.has(item.ingredientId))
      .map((item) => item.id);
    const gone = new Set([...ids, ...confirmedMissing]);
    const target: SuggestionFocus =
      from === null ? { kind: "camera" } : typeof from === "string" ? focusAfter(visibleCards(result), from, gone) : from;
    analysis.editResult(generation, (current) => ({
      ...current,
      suggestions: withConfirmedStock(
        current.suggestions.filter((suggestion) => !gone.has(suggestion.id)),
        items,
      ),
      inventory:
        current.inventory.kind === "compared"
          ? { ...current.inventory, missing: current.inventory.missing.filter((item) => !gone.has(item.id)) }
          : current.inventory,
    }));
    requestFocus(target);
  }

  /** The suggestions `ids` that can be confirmed now, as the cards show them (never one that is unchanged). */
  function chosenSuggestions(generation: number, result: AnalyzeResult, ids: readonly string[]): PantrySuggestion[] {
    const wanted = new Set(ids);
    const { added, changed } = groupSuggestions(result);
    return [...added, ...changed].filter(
      (suggestion) => wanted.has(suggestion.id) && isConfirmable(suggestion) && !isRefused(generation, suggestion.id),
    );
  }

  /** Shows a failure at the top of the section, marks the refused suggestions, and gives focus back. */
  function failed(generation: number, appError: AppError, itemIds: readonly string[], focus: SuggestionFocus) {
    const fields = appError.code === "validation" ? (appError.fields ?? {}) : {};
    refuse(
      generation,
      Object.keys(fields).flatMap((index) => (itemIds[Number(index)] ? [itemIds[Number(index)]] : [])),
    );
    setError({ error: appError, generation });
    requestFocus(focus);
  }

  /**
   * Saves an inventory (Story 6.4) for the cards `ids`. Removals, and
   * "Bekräfta alla" while a confirmation with "Ångra" for the same place
   * shows, send the operation id of that confirmation, else of a removal in
   * the same place that failed, else a new one; the server keeps the removed
   * rows under it. `joined` is the confirmation the answer joins: the one
   * whose id was sent, if it still shows.
   */
  async function saveInventory(
    ids: readonly string[],
    all: boolean,
    request: InventoryRequest,
  ): Promise<{
    result: Result<ConfirmedInventory>;
    operationId: string | null;
    joined: RemovalBatch | null;
    /** How many rows the operation kept before this call, as far as known. */
    before: number;
  }> {
    const removes = request.removeRowIds.length > 0;
    const showing = batch.current?.location === request.location ? batch.current : null;
    const spare = spareOperation.current?.location === request.location ? spareOperation.current.id : null;
    const sent = removes || (all && showing) ? (showing?.id ?? spare ?? newId()) : null;
    const { location, items, replaceRowIds, removeRowIds } = request;
    const input: InventoryConfirmInput = { location, items, replaceRowIds, removeRowIds, operationId: sent };
    const { result } = await save(ids, all, () => confirmPantryInventory(input), "pantry_inventory_failed");
    if (!result.ok) {
      // A new id is kept for the next removal; a confirmation's id is used again only while it shows.
      if (removes && sent && sent !== showing?.id) spareOperation.current = { id: sent, location: request.location };
      return { result, operationId: sent, joined: null, before: 0 };
    }
    if (sent === spare) spareOperation.current = null;
    const operationId = result.data.operationId ?? sent;
    const sentShowing = showing !== null && operationId === showing.id;
    const joined = sentShowing && batch.current === showing ? showing : null;
    return { result, operationId, joined, before: sentShowing ? showing.undoable : 0 };
  }

  /**
   * "Ångra" for removals: puts back every row the server keeps under the
   * batch's operation id, and their "Syns inte längre" cards while the
   * suggestions are the same.
   */
  async function undoRemoval(undone: RemovalBatch) {
    let result: Awaited<ReturnType<typeof restorePantryRemoval>>;
    let lost = false;
    try {
      result = await restorePantryRemoval(undone.id);
    } catch {
      result = fail("pantry_restore_failed");
      lost = true;
    }
    if (!result.ok) {
      showToast(result.error.message, { role: "alert" });
      if (lost || result.error.code === "unauthorized") router.refresh();
      return;
    }
    const back = new Set(result.data.restoredIds);
    const cards = undone.items.filter((item) => item.rows.some((row) => back.has(row.id)));
    if (cards.length > 0) analysis.editMissing(undone.generation, (missing) => withMissing(missing, cards));
    if (result.data.skipped > 0) showToast(notRestoredText(result.data.skipped), { role: "alert" });
  }

  /**
   * Shows `text` with "Ångra" (or `undoLabel`) for the removals in `next`,
   * which later removals in the same place join while it shows. "Ångra"
   * tapped while a confirmation is being saved waits for its answer.
   */
  function showRemovals(next: RemovalBatch, text: string, undoLabel?: string) {
    batch.current = next;
    const forget = () => {
      if (batch.current === next) batch.current = null;
    };
    showToast(text, {
      undoLabel,
      onUndo: () => {
        forget();
        const undo = () => void undoRemoval(next);
        if (busy.current) deferred.current.push(undo);
        else undo();
      },
      onClose: forget,
    });
  }

  /**
   * After a save with removals: the items removed now (`items`), and the
   * batch for the confirmation, joined to `joined` when the answer joins it.
   * Rows the operation keeps that were not kept before (`added`) count, so a
   * removal whose rows went in an earlier call with the same id that got no
   * answer counts as removed now.
   */
  function removalsOf(
    data: ConfirmedInventory,
    operationId: string,
    missing: readonly MissingItem[],
    location: Location,
    generation: number,
    joined: RemovalBatch | null,
    before: number,
  ): { batch: RemovalBatch; items: MissingItem[]; added: number } {
    const added = data.undoable - before;
    const removedIngredients = new Set(data.removed.map((row) => row.ingredientId));
    let items = missing.filter((item) => removedIngredients.has(item.ingredientId));
    if (items.length === 0 && (added > 0 || data.removedCount > 0)) items = [...missing];
    const earlier = joined?.items ?? [];
    return {
      batch: {
        id: operationId,
        location,
        generation,
        items: [...earlier, ...items.filter((item) => !earlier.some((other) => other.id === item.id))],
        undoable: data.undoable,
      },
      items,
      added,
    };
  }

  async function confirm(ids: readonly string[], options?: { all?: boolean }) {
    if (busy.current) return;
    const all = options?.all ?? false;
    const generation = analysis.generation();
    const result = analysis.latestResult(generation);
    if (!result) return;
    const groups = groupSuggestions(result);
    const { compared, incomplete, missing: allMissing } = groups;
    // "Bekräfta alla" never takes a suggestion the model was unsure of (Story 6.5): its card stays, the
    // confirmation says how many such cards that can be confirmed are left, and focus goes to the first.
    const chosen = chosenSuggestions(generation, result, ids).filter((suggestion) => !all || isBulkConfirmable(suggestion));
    const uncertain = all
      ? [...groups.added, ...groups.changed].filter(
          (suggestion) => !isBulkConfirmable(suggestion) && isConfirmable(suggestion) && !isRefused(generation, suggestion.id),
        )
      : [];
    const withUncertain = (text: string) => (uncertain.length > 0 ? `${text} ${uncertainLeftText(uncertain.length)}` : text);
    const uncertainFocus: SuggestionFocus | null = uncertain.length > 0 ? { kind: "confirm", id: uncertain[0].id } : null;
    if (!compared) {
      await confirmPlain(generation, chosen, all, { withUncertain, uncertainFocus });
      return;
    }
    // An incomplete comparison removes nothing with "Bekräfta alla": only "Ta bort" does.
    const missing = all && !incomplete ? allMissing : [];
    if (chosen.length === 0 && missing.length === 0) return;
    const request = inventoryRequest({ location: result.location, suggestions: chosen, missing });
    const saved = chosen.filter((suggestion) => request.included.includes(suggestion.id));
    const savedIds = saved.map((suggestion) => suggestion.id);
    const answer = await saveInventory([...savedIds, ...missing.map(({ id }) => id)], all, request);
    const current = analysis.generation() === generation;
    if (!answer.result.ok) {
      if (current) {
        failed(generation, answer.result.error, savedIds, all ? { kind: "confirmAll" } : { kind: "confirm", id: savedIds[0] });
      }
      runDeferred();
      return;
    }
    const { data } = answer.result;
    if (current) {
      takeOut(
        generation,
        [...savedIds, ...missing.map(({ id }) => id)],
        (all ? uncertainFocus : null) ?? (all && request.left.length === 0 ? null : (savedIds[0] ?? null)),
        request.items,
        data.setIngredientIds,
      );
    }
    if (!all) {
      showToast(current ? savedItemText(saved[0].name, saved[0].location) : confirmedItemsText(1));
    } else {
      const removals = answer.operationId
        ? removalsOf(data, answer.operationId, missing, result.location, generation, answer.joined, answer.before)
        : null;
      const counts = inventoryAppliedText(result.location, {
        added: saved.filter((suggestion) => suggestion.change !== "changed").length,
        changed: saved.filter((suggestion) => suggestion.change === "changed").length,
        // This call's removals only; "Ångra borttagning" may put back earlier ones too.
        removed: removals?.items.length ?? 0,
      });
      const text = withUncertain(request.left.length > 0 ? `${counts} ${changesLeftText(request.left.length)}` : counts);
      if (removals && removals.batch.undoable > 0) showRemovals(removals.batch, text, undoRemovalLabel);
      else showToast(text);
    }
    runDeferred();
  }

  /**
   * Bekräfta and "Bekräfta alla" for a photo of an empty place, or one that
   * could not be read (Story 6.2). For "Bekräfta alla" with unsure
   * suggestions left (Story 6.5), `withUncertain` adds how many to the
   * confirmation and `uncertainFocus` is where focus goes.
   */
  async function confirmPlain(
    generation: number,
    chosen: readonly PantrySuggestion[],
    all: boolean,
    {
      withUncertain = (text: string) => text,
      uncertainFocus = null,
    }: { withUncertain?: (text: string) => string; uncertainFocus?: SuggestionFocus | null } = {},
  ) {
    if (chosen.length === 0) return;
    const chosenIds = chosen.map((suggestion) => suggestion.id);
    const items = chosen.map(confirmItemFromSuggestion);
    const { result } = await save(chosenIds, all, () => confirmPantrySuggestions(items), "pantry_confirm_failed");
    if (analysis.generation() !== generation) {
      // Newer suggestions came meanwhile: nothing to take out, and no notice about cards that are gone.
      if (result.ok) showToast(confirmedItemsText(chosen.length));
    } else if (!result.ok) {
      failed(generation, result.error, chosenIds, all ? { kind: "confirmAll" } : { kind: "confirm", id: chosen[0].id });
    } else {
      // The action revalidated Hemma, so the location cards and the list show the new items.
      takeOut(generation, chosenIds, all ? uncertainFocus : chosen[0].id, items);
      showToast(
        withUncertain(
          chosen.length === 1 ? savedItemText(chosen[0].name, chosen[0].location) : confirmedItemsText(chosen.length),
        ),
      );
    }
    runDeferred();
  }

  async function confirmCorrected(
    id: string,
    generation: number,
    form: PantryItemForm,
    onSaved: () => void,
  ): Promise<CorrectOutcome> {
    if (busy.current) return { kind: "busy" };
    const result = analysis.latestResult(generation);
    const suggestion = result?.suggestions.find((other) => other.id === id);
    if (!result || !suggestion) return { kind: "gone" };
    const item = confirmItemFromForm(form, suggestion);
    let answer: Result<unknown>;
    let setIngredientIds: readonly string[] = [];
    if (result.inventory.kind === "compared") {
      // The rows in other units go only while the sheet keeps the suggestion's own ingredient and place.
      const own =
        form.ingredient.kind === "existing" &&
        suggestion.ingredient.kind === "existing" &&
        form.ingredient.ingredientId === suggestion.ingredient.ingredientId &&
        form.location === suggestion.location;
      // A changed unit replaces every row of the ingredient in the place; the server keeps the one with the item's key.
      const unitChanged = form.unit !== suggestion.unit;
      const request: InventoryRequest = {
        location: result.location,
        items: [item],
        replaceRowIds: own ? [...(unitChanged ? (suggestion.placeRowIds ?? suggestion.replaces) : suggestion.replaces)] : [],
        removeRowIds: [],
      };
      const saved = await saveInventory([id], false, request);
      answer = saved.result;
      if (saved.result.ok) setIngredientIds = saved.result.data.setIngredientIds;
    } else {
      answer = (await save([id], false, () => confirmPantrySuggestions([item]), "pantry_confirm_failed")).result;
    }
    let outcome: CorrectOutcome;
    if (!answer.ok) {
      outcome = { kind: "failed", error: answer.error };
    } else if (analysis.generation() !== generation) {
      outcome = { kind: "savedStale" };
    } else {
      onSaved();
      takeOut(generation, [id], id, [item], setIngredientIds);
      outcome = { kind: "saved" };
    }
    runDeferred();
    return outcome;
  }

  function reject(id: string, generation = analysis.generation()): RejectOutcome {
    if (busy.current) return "busy";
    const suggestions = analysis.latestSuggestions(generation);
    const index = suggestions?.findIndex((suggestion) => suggestion.id === id) ?? -1;
    if (!suggestions || index < 0) return "gone";
    const suggestion = suggestions[index];
    const neighbours = { before: suggestions[index - 1]?.id ?? null, after: suggestions[index + 1]?.id ?? null, index };
    setError(null);
    takeOut(generation, [id], id, []);
    const undo = () => {
      const back = analysis.editSuggestions(generation, (current) => putBack(current, suggestion, neighbours));
      if (back) requestFocus({ kind: "confirm", id });
    };
    // Only the latest rejection can be undone: a new confirmation replaces this one.
    showToast(rejectedItemText(suggestion.name), {
      onUndo: () => {
        if (busy.current) deferred.current.push(undo);
        else undo();
      },
    });
    return "rejected";
  }

  /** The "Syns inte längre" items of `generation`, or `null`. */
  function missingOf(generation: number): readonly MissingItem[] | null {
    const result = analysis.latestResult(generation);
    return result?.inventory.kind === "compared" ? result.inventory.missing : null;
  }

  async function removeMissing(id: string) {
    if (busy.current) return;
    const generation = analysis.generation();
    const result = analysis.latestResult(generation);
    const item = missingOf(generation)?.find((other) => other.id === id);
    if (!result || !item) return;
    const request = inventoryRequest({ location: result.location, suggestions: [], missing: [item] });
    const answer = await saveInventory([id], false, request);
    const current = analysis.generation() === generation;
    if (!answer.result.ok) {
      if (current) failed(generation, answer.result.error, [], { kind: "confirm", id });
      runDeferred();
      return;
    }
    if (current) takeOut(generation, [id], id, []);
    const removals = answer.operationId
      ? removalsOf(answer.result.data, answer.operationId, [item], result.location, generation, answer.joined, answer.before)
      : null;
    // Rows kept for "Ångra" now that were not before: removed by this call, or by one with the same id that got no answer.
    if (removals && removals.added > 0) {
      showRemovals(removals.batch, removedItemsText(removals.batch.items.map(({ name }) => name)));
    } else if (!batch.current) {
      // Another tab removed it already: nothing to undo. A confirmation with "Ångra" that shows stays.
      showToast(alreadyRemovedText(item.name));
    }
    runDeferred();
  }

  function keepMissing(id: string) {
    if (busy.current) return;
    const generation = analysis.generation();
    const missing = missingOf(generation);
    const index = missing?.findIndex((item) => item.id === id) ?? -1;
    if (!missing || index < 0) return;
    const item = missing[index];
    const neighbours = { before: missing[index - 1]?.id ?? null, after: missing[index + 1]?.id ?? null, index };
    setError(null);
    takeOut(generation, [id], id, []);
    const undo = () => {
      const back = analysis.editMissing(generation, (current) => putBack(current, item, neighbours));
      if (back) requestFocus({ kind: "confirm", id });
    };
    showToast(keptItemText(item.name, item.location), {
      onUndo: () => {
        if (busy.current) deferred.current.push(undo);
        else undo();
      },
    });
  }

  const { result, resultGeneration } = analysis;
  const invalidIds = useMemo(() => {
    const ids = new Set<string>();
    for (const suggestion of result?.suggestions ?? []) {
      const byServer = refused?.generation === resultGeneration && refused.ids.has(suggestion.id);
      if (byServer || !isConfirmable(suggestion)) ids.add(suggestion.id);
    }
    return ids;
  }, [result, resultGeneration, refused]);

  const currentError = error && error.generation === resultGeneration ? error.error : null;
  return {
    saving: pending !== null,
    savingIds: pending?.ids ?? noIds,
    savingAll: pending?.all ?? false,
    confirmError: currentError,
    invalidIds,
    confirm: (ids, options) => void confirm(ids, options),
    confirmCorrected,
    reject,
    removeMissing: (id) => void removeMissing(id),
    keepMissing,
    confirmButtonRef,
    confirmAllRef,
    flushFocus,
  };
}

const noIds: ReadonlySet<string> = new Set();
