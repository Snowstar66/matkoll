"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dishSuggestionsSchema, toAvoidTitles, type DishSuggestion } from "@/features/suggestions";
import { postAi } from "@/lib/ai-client";
import { fail, type AppError } from "@/lib/errors";

// The state of AI-förslag (FR-23), held by the library so the suggestions stay
// while the pills change, as long as /recept is open. They live only here:
// never on the server, in localStorage or in the address, until Pontus saves
// one. The AI is only asked when Pontus presses the button.

/**
 * A suggestion as shown, with a key of its own for the list and the sheet,
 * and the id it gets when saved, made when it arrives: saving it again after
 * a lost answer, also from a sheet opened anew, never makes a copy.
 */
export type ShownSuggestion = DishSuggestion & { key: number; recipeId: string };

export type DishSuggestionsState = {
  suggestions: ShownSuggestion[];
  /** A call to /api/ai/suggest is on its way. */
  loading: boolean;
  /** Why the last call failed; the suggestions from before stay. */
  error: AppError | null;
  /** Increases when new suggestions arrive, so the section can move focus to its heading. */
  arrivals: number;
  /** Increases when "Avbryt" stops a call, so the button can take focus back. */
  cancels: number;
  /** "Föreslå rätter med AI", "Föreslå andra rätter" and "Försök igen": asks for new suggestions. */
  suggest: () => void;
  /** "Avbryt": stops the call; nothing is shown for it and the suggestions from before stay. */
  cancel: () => void;
  /** A saved suggestion leaves the section; its title is still avoided by "Föreslå andra rätter". */
  remove: (key: number) => void;
};

export function useDishSuggestions(): DishSuggestionsState {
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<ShownSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [arrivals, setArrivals] = useState(0);
  const [cancels, setCancels] = useState(0);
  /** The call on its way; `null` once it has answered, been stopped or the library has gone away. */
  const request = useRef<AbortController | null>(null);
  const nextKey = useRef(0);
  /** Titles of saved suggestions, newest first. */
  const savedTitles = useRef<string[]>([]);

  // Stop a running call when the library goes away, also when the page is
  // only hidden after a navigation: the answer is then not wanted, and the
  // button is back when the page shows again.
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      setLoading(false);
    },
    [],
  );

  async function suggest() {
    // One call at a time.
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);

    // The titles shown, then those saved, so the model suggests something new
    // ("Föreslå andra rätter"), cleaned and cut to what the server takes.
    const avoidTitles = toAvoidTitles([...suggestions.map(({ draft }) => draft.title), ...savedTitles.current]);
    const result = await postAi<unknown>("/api/ai/suggest", { avoidTitles }, controller.signal);
    // Stopped ("Avbryt", the library gone), or replaced by a newer call, which owns the state.
    if (controller.signal.aborted || request.current !== controller) return;
    request.current = null;
    setLoading(false);
    if (!result.ok && "aborted" in result) return;

    if (result.ok) {
      const parsed = dishSuggestionsSchema.safeParse(result.data);
      if (parsed.success) {
        // New suggestions replace the old ones only now that they are here.
        setSuggestions(
          parsed.data.suggestions.map((suggestion) => ({
            ...suggestion,
            key: ++nextKey.current,
            recipeId: crypto.randomUUID(),
          })),
        );
        setArrivals((count) => count + 1);
        return;
      }
      setError(fail("ai_invalid").error);
      return;
    }
    // An expired session: the page sends Pontus to sign in.
    if (result.error.code === "unauthorized") router.refresh();
    setError(result.error);
  }

  function cancel() {
    if (!request.current) return;
    request.current.abort();
    request.current = null;
    setLoading(false);
    setCancels((count) => count + 1);
  }

  function remove(key: number) {
    const saved = suggestions.find((suggestion) => suggestion.key === key);
    if (saved) savedTitles.current = [saved.draft.title, ...savedTitles.current];
    setSuggestions((current) => current.filter((suggestion) => suggestion.key !== key));
  }

  return {
    suggestions,
    loading,
    error,
    arrivals,
    cancels,
    suggest: () => void suggest(),
    cancel,
    remove,
  };
}
