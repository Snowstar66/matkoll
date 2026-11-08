"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { clearStepChecks, readStepChecks, saveStepChecks, stepChecksChangedEvent } from "./step-checks";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(stepChecksChangedEvent, listener);
  document.addEventListener("visibilitychange", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(stepChecksChangedEvent, listener);
    document.removeEventListener("visibilitychange", listener);
  };
}

/** The ticked steps of a recipe on this device, a toggle and a reset. None on the server and in the first render. */
export function useStepChecks(recipeId: string) {
  // A string snapshot, so React sees the same value until the ticks change.
  const joined = useSyncExternalStore(
    subscribe,
    () => readStepChecks(recipeId).join(","),
    () => "",
  );
  const checked = useMemo(() => new Set(joined === "" ? [] : joined.split(",")), [joined]);
  const toggle = useCallback(
    (stepId: string) => {
      const current = readStepChecks(recipeId);
      saveStepChecks(recipeId, current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId]);
    },
    [recipeId],
  );
  const reset = useCallback(() => clearStepChecks(recipeId), [recipeId]);
  return { checked, toggle, reset };
}
