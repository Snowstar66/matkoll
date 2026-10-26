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
import { fail, type AppError, type Result } from "@/lib/errors";
import { confirmPantrySuggestions } from "../actions/confirm-pantry-suggestions";
import type { PantryItemForm } from "../domain/pantry-item-form";
import {
  confirmItemFromForm,
  confirmItemFromSuggestion,
  isConfirmable,
  withConfirmedStock,
  type ConfirmItemInput,
  type PantrySuggestion,
} from "../domain/pantry-suggestion";
import { confirmedItemsText, rejectedItemText, savedItemText } from "../domain/places";
import { focusIsFree, type PantryAnalysis, usePantryAnalysis } from "./use-pantry-analysis";

// Lagerförslag for Hemma (FR-24, FR-25): one analysis state for the page,
// shared by the camera button (PantryCamera), the section
// (PantrySuggestionList) and the sheet Lagervara. The provider sits above the
// <Suspense> keyed on the location and has no key of its own, so the
// suggestions stay when another location card is chosen, and go when Hemma
// is left or reloaded.
//
// Nothing becomes a pantry item without a tap (FR-25): Bekräfta, "Bekräfta
// alla" and the sheet's "Bekräfta" each save at once through
// confirmPantrySuggestions, one call at a time, and take the saved
// suggestions out. Avvisa takes one out here alone, with "Ångra" in the short
// confirmation, and never reaches the server. Focus after a change is moved
// from here, so a list or camera button mounted anew under another location
// card still gets a move that was asked for while they were away.

/** How long a confirmation may take before it counts as failed, so the buttons work again. */
export const confirmTimeoutMs = 30_000;

/** Where focus goes once the section has changed: a card's Bekräfta, "Bekräfta alla", or the camera button. */
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
  /** The suggestions being saved, whose cards say "Sparar …". */
  savingIds: ReadonlySet<string>;
  /** The call being saved is "Bekräfta alla". */
  savingAll: boolean;
  /** Why the last confirmation failed; the suggestions stay. */
  confirmError: AppError | null;
  /** The suggestions that cannot be confirmed as they are (checked here, or refused by the server): "Bekräfta alla" leaves them out. */
  invalidIds: ReadonlySet<string>;
  /** Bekräfta (one id) or "Bekräfta alla" (`all`): saves the suggestions as they are. */
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
  /** A ref callback for a card's Bekräfta, so focus can be moved to it. */
  confirmButtonRef: (id: string) => (button: HTMLButtonElement) => () => void;
  /** "Bekräfta alla". */
  confirmAllRef: RefObject<HTMLButtonElement | null>;
  /** Moves focus asked for while the list or camera button was away; for their mount, only while focus is free. */
  flushFocus: () => void;
};

export type PantrySuggestions = PantryAnalysis & PantryReview;

const PantrySuggestionsContext = createContext<PantrySuggestions | null>(null);

/**
 * Where focus goes when `id` leaves the list and `gone` with it: the next
 * card's Bekräfta, else the previous card's, else the camera button.
 */
export function focusAfter(
  suggestions: readonly PantrySuggestion[],
  id: string,
  gone: ReadonlySet<string>,
): SuggestionFocus {
  const index = suggestions.findIndex((suggestion) => suggestion.id === id);
  const stays = (suggestion: PantrySuggestion) => !gone.has(suggestion.id);
  const next = suggestions.slice(index + 1).find(stays) ?? suggestions.slice(0, Math.max(index, 0)).reverse().find(stays);
  return next ? { kind: "confirm", id: next.id } : { kind: "camera" };
}

/**
 * Puts a rejected suggestion back after the one that was before it, else
 * before the one that was after it, else where it was, as far as the list
 * reaches now.
 */
export function putBack(
  suggestions: readonly PantrySuggestion[],
  suggestion: PantrySuggestion,
  neighbours: { before: string | null; after: string | null; index: number },
): PantrySuggestion[] {
  if (suggestions.some((other) => other.id === suggestion.id)) return [...suggestions];
  const position = (id: string | null) => (id === null ? -1 : suggestions.findIndex((other) => other.id === id));
  let at: number;
  if (neighbours.before === null) at = 0;
  else if (position(neighbours.before) >= 0) at = position(neighbours.before) + 1;
  else if (position(neighbours.after) >= 0) at = position(neighbours.after);
  else at = Math.min(neighbours.index, suggestions.length);
  return [...suggestions.slice(0, at), suggestion, ...suggestions.slice(at)];
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

/** The confirmation's answer, or `pantry_confirm_failed` when there is none within confirmTimeoutMs or the call fails. */
async function confirmWithin(items: ConfirmItemInput[]): Promise<Result<{ count: number }>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Result<{ count: number }>>((resolve) => {
    timer = setTimeout(() => resolve(fail("pantry_confirm_failed")), confirmTimeoutMs);
  });
  try {
    return await Promise.race([confirmPantrySuggestions(items), timeout]);
  } catch {
    // No answer (e.g. no connection): the suggestions stay.
    return fail("pantry_confirm_failed");
  } finally {
    clearTimeout(timer);
  }
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

  /** Moves focus to the target, or the camera button when the target is gone; waits while neither is there. */
  const applyFocus = useCallback(() => {
    const target = focusTarget.current;
    if (!target) return;
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

  const flushFocus = useCallback(() => {
    if (focusTarget.current && focusIsFree(null)) applyFocus();
  }, [applyFocus]);

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

  /** Saves `items` for the suggestions `ids`; `unauthorized` reads the page again, which sends Pontus to sign in. */
  async function save(ids: readonly string[], items: ConfirmItemInput[], all: boolean): Promise<Result<{ count: number }>> {
    busy.current = true;
    setPending({ ids: new Set(ids), all });
    setError(null);
    const result = await confirmWithin(items);
    busy.current = false;
    setPending(null);
    if (!result.ok && result.error.code === "unauthorized") router.refresh();
    return result;
  }

  /** The "Ångra" that waited for a confirmation. */
  function runDeferred() {
    const waiting = deferred.current;
    deferred.current = [];
    for (const undo of waiting) undo();
  }

  /**
   * Takes the saved suggestions out, updates "I kylen nu" on the rest, and
   * moves focus on from `from` (or to the camera button).
   */
  function takeOut(generation: number, ids: readonly string[], from: string | null, items: readonly ConfirmItemInput[]) {
    const gone = new Set(ids);
    const suggestions = analysis.latestSuggestions(generation);
    if (!suggestions) return;
    const target = from === null ? ({ kind: "camera" } as const) : focusAfter(suggestions, from, gone);
    analysis.editSuggestions(generation, (current) =>
      withConfirmedStock(
        current.filter((suggestion) => !gone.has(suggestion.id)),
        items,
      ),
    );
    requestFocus(target);
  }

  async function confirm(ids: readonly string[], options?: { all?: boolean }) {
    if (busy.current) return;
    const all = options?.all ?? false;
    const generation = analysis.generation();
    const wanted = new Set(ids);
    const chosen = (analysis.latestSuggestions(generation) ?? []).filter(
      (suggestion) => wanted.has(suggestion.id) && isConfirmable(suggestion) && !isRefused(generation, suggestion.id),
    );
    if (chosen.length === 0) return;
    const chosenIds = chosen.map((suggestion) => suggestion.id);
    const items = chosen.map(confirmItemFromSuggestion);
    const result = await save(chosenIds, items, all);
    if (analysis.generation() !== generation) {
      // Newer suggestions came meanwhile: nothing to take out, and no notice about cards that are gone.
      if (result.ok) showToast(confirmedItemsText(chosen.length));
    } else if (!result.ok) {
      const fields = result.error.code === "validation" ? (result.error.fields ?? {}) : {};
      refuse(
        generation,
        Object.keys(fields).flatMap((index) => (chosenIds[Number(index)] ? [chosenIds[Number(index)]] : [])),
      );
      setError({ error: result.error, generation });
      requestFocus(all ? { kind: "confirmAll" } : { kind: "confirm", id: chosen[0].id });
    } else {
      // The action revalidated Hemma, so the location cards and the list show the new items.
      takeOut(generation, chosenIds, all ? null : chosen[0].id, items);
      showToast(
        chosen.length === 1 ? savedItemText(chosen[0].name, chosen[0].location) : confirmedItemsText(chosen.length),
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
    const suggestion = analysis.latestSuggestions(generation)?.find((other) => other.id === id);
    if (!suggestion) return { kind: "gone" };
    const item = confirmItemFromForm(form, suggestion);
    const result = await save([id], [item], false);
    let outcome: CorrectOutcome;
    if (!result.ok) {
      outcome = { kind: "failed", error: result.error };
    } else if (analysis.generation() !== generation) {
      outcome = { kind: "savedStale" };
    } else {
      onSaved();
      takeOut(generation, [id], id, [item]);
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
    confirmButtonRef,
    confirmAllRef,
    flushFocus,
  };
}

const noIds: ReadonlySet<string> = new Set();
